// --- データ管理 ---
let currentLang = localStorage.getItem('sushiGameLang') || 'ja';

// フリックモード用ハイスコア
let stageHighScores = JSON.parse(localStorage.getItem('sushiGameStageScores')) || [0, 0, 0, 0, 0];
let customStages = JSON.parse(localStorage.getItem('sushiGameCustomStages')) || [];
let customStageHighScores = JSON.parse(localStorage.getItem('sushiGameCustomStageScores')) || {};

// 音声認識モード用ハイスコア（個別管理）
let voiceStageHighScores = JSON.parse(localStorage.getItem('sushiGameVoiceStageScores')) || [0, 0, 0, 0, 0];
let voiceCustomStageHighScores = JSON.parse(localStorage.getItem('sushiGameVoiceCustomStageScores')) || {};

let activeThemeId = localStorage.getItem('sushiGameTheme') || 'theme-default';
let showHint = localStorage.getItem('sushiGameHint') !== 'false';
let enableVoice = localStorage.getItem('sushiGameVoice') !== 'false';

let currentStageIndex = 0;
let currentGameMode = 'flick'; // 'flick' または 'voice'
let lastWordIndex = -1;
let successStreak = 0;
let feverTurns = 0; 
let isWaitingForTutorial = false;

document.body.className = activeThemeId;

// --- 外部定義された themes（words.js等）のモード・アンロック条件を安全に上書き・追加 ---
if (typeof themes !== 'undefined') {
    themes.forEach(theme => {
        if (theme.id === 'theme-default') {
            theme.unlockScore = 0; 
            theme.mode = 'flick';
        } else if (theme.id === 'theme-wood') {
            theme.unlockScore = 500;
            theme.mode = 'flick'; 
        } else if (theme.id === 'theme-pixel') {
            theme.unlockScore = 2500; 
            theme.mode = 'flick'; 
        } else if (theme.id === 'theme-neon') {
            theme.unlockScore = 1000;
            theme.mode = 'voice'; 
        } else if (theme.id === 'theme-gold') {
            theme.unlockScore = 1500;
            theme.mode = 'voice'; 
        }
    });

    if (!themes.some(t => t.id === 'theme-pixel')) {
        themes.push({
            id: 'theme-pixel',
            unlockScore: 2500,
            mode: 'flick',
            color: '#00ffcc'
        });
    }
}

// --- 音声ボイスの選択・設定ロジック ---
let selectedJapaneseVoice = null;

function updateJapaneseVoices() {
    if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));

        let targetVoice = japaneseVoices.find(v => v.name.includes('Nanami') && v.name.includes('Natural'));
        if (!targetVoice) {
            targetVoice = japaneseVoices.find(v => v.name.includes('Google 日本語') || v.name.includes('Google Japanese'));
        }
        if (!targetVoice && japaneseVoices.length > 0) {
            targetVoice = japaneseVoices[0];
        }
        selectedJapaneseVoice = targetVoice || null;
    }
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = updateJapaneseVoices;
    updateJapaneseVoices();
}

// --- 音声ファイル再生の管理用変数 ---
let currentAudio = null;

function playWordAudio(word, force = false) {
    if (!enableVoice && !force) return;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    const speakText = word.speak || word.hiragana;
    const audioPath = `sounds/${speakText}.wav`;
    const audio = new Audio(audioPath);
    currentAudio = audio;

    audio.play().then(() => {
    }).catch((error) => {
        currentAudio = null;
        speakJapanese(speakText, force);
    });
}

function speakJapanese(text, force = false) {
    if ((enableVoice || force) && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        if (selectedJapaneseVoice) {
            utterance.voice = selectedJapaneseVoice;
        }
        window.speechSynthesis.speak(utterance);
    }
}

function getTotalBestScore(mode = 'flick') {
    if (mode === 'voice') {
        const standardTotal = voiceStageHighScores.reduce((sum, score) => sum + score, 0);
        const customTotal = Object.values(voiceCustomStageHighScores).reduce((sum, score) => sum + score, 0);
        return standardTotal + customTotal;
    }
    const standardTotal = stageHighScores.reduce((sum, score) => sum + score, 0);
    const customTotal = Object.values(customStageHighScores).reduce((sum, score) => sum + score, 0);
    return standardTotal + customTotal;
}

// --- 画面要素 ---
const homeScreen = document.getElementById('home-screen');
const modeSelectScreen = document.getElementById('mode-select-screen');
const stageScreen = document.getElementById('stage-screen');
const createStageScreen = document.getElementById('create-stage-screen');
const storeScreen = document.getElementById('store-screen');
const zukanScreen = document.getElementById('zukan-screen');
const zukanModal = document.getElementById('zukan-modal');
const settingScreen = document.getElementById('setting-screen');
const langScreen = document.getElementById('lang-screen');
const gameScreen = document.getElementById('game-screen');
const voiceGameScreen = document.getElementById('voice-game-screen');
const gameOverModal = document.getElementById('game-over-modal');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const homeKanjiBg = document.getElementById('home-kanji-bg');

const homeFlickTotalScore = document.getElementById('home-flick-total-score');
const homeVoiceTotalScore = document.getElementById('home-voice-total-score');
const storeTotalScore = document.getElementById('store-total-score');
const newRecordMsg = document.getElementById('new-record-msg');

function recordWrongWord(word) {
    let wrongWords = JSON.parse(localStorage.getItem('sushiGameWrongWords')) || [];
    if (!wrongWords.some(w => w.hiragana === word.hiragana)) {
        wrongWords.push(word);
        localStorage.setItem('sushiGameWrongWords', JSON.stringify(wrongWords));
    }
}

let selectedZukanWord = null;
function renderZukan() {
    const container = document.getElementById('zukan-list-container');
    container.innerHTML = '';

    let allWordsMap = new Map();
    defaultStagesData.forEach(stage => {
        stage.words.forEach(w => {
            if (!allWordsMap.has(w.hiragana)) {
                allWordsMap.set(w.hiragana, w);
            }
        });
    });

    allWordsMap.forEach(word => {
        const item = document.createElement('div');
        item.className = 'zukan-item';
        item.innerHTML = `
            <span class="zukan-emoji">${word.emoji || '🍣'}</span>
            <span class="zukan-en">${word.english}</span>
            <span class="zukan-ja">${word.hiragana}</span>
            <span class="zukan-ro">${word.romaji}</span>
        `;
        item.onclick = () => {
            selectedZukanWord = word;
            document.getElementById('modal-emoji').textContent = word.emoji || '🍣';
            document.getElementById('modal-ja').textContent = word.hiragana;
            document.getElementById('modal-en-ro').textContent = `${word.english} (${word.romaji})`;
            document.getElementById('modal-trivia').textContent = word.trivia || '豆知識が準備中だよ！';
            zukanModal.classList.remove('hidden');
            playWordAudio(word, true);
        };
        container.appendChild(item);
    });
}

document.getElementById('modal-speak-btn').addEventListener('click', () => {
    if (selectedZukanWord) playWordAudio(selectedZukanWord, true);
});

document.getElementById('modal-close-btn').addEventListener('click', () => {
    zukanModal.classList.add('hidden');
});

function applyLanguage() {
    const t = i18n[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.placeholder = t[key];
    });

    document.getElementById('lang-ja-btn').classList.toggle('active', currentLang === 'ja');
    document.getElementById('lang-en-btn').classList.toggle('active', currentLang === 'en');
    document.getElementById('modal-speak-btn').textContent = t.speakBtn;
    updateSettingsButtonText();
}

function updateSettingsButtonText() {
    const t = i18n[currentLang];
    document.getElementById('toggle-hint-btn').textContent = `${t.hintLabel}: ${showHint ? t.on : t.off}`;
    document.getElementById('toggle-voice-btn').textContent = `${t.voiceLabel}: ${enableVoice ? t.on : t.off}`;
}

if (homeFlickTotalScore) homeFlickTotalScore.textContent = getTotalBestScore('flick');
if (homeVoiceTotalScore) homeVoiceTotalScore.textContent = getTotalBestScore('voice');
applyLanguage();

function renderStages() {
    const container = document.getElementById('stage-list-container');
    container.innerHTML = '';
    const t = i18n[currentLang];

    for (let index = 0; index < 5; index++) {
        const btn = document.createElement('button');
        btn.className = `selection-btn btn-stage ${currentStageIndex === index ? 'active' : ''}`;
        const stageName = t.stages[index];
        const stageLabelPrefix = currentLang === 'ja' ? `ステージ ${index + 1}: ` : `Stage ${index + 1}: `;
        
        const bestScoreForStage = (currentGameMode === 'voice') 
            ? (voiceStageHighScores[index] || 0) 
            : (stageHighScores[index] || 0);
        
        btn.innerHTML = `
            <span>${stageLabelPrefix}${stageName}</span>
            <span class="stage-btn-sub">${t.bestScoreLabel}${bestScoreForStage}</span>
        `;
        
        btn.onclick = () => {
            currentStageIndex = index;
            startSelectedMode(); 
        };
        container.appendChild(btn);
    }

    customStages.forEach((customStage, cIndex) => {
        const stageKey = `custom_${customStage.id}`;
        const btn = document.createElement('button');
        btn.className = `selection-btn custom-stage-btn ${currentStageIndex === stageKey ? 'active' : ''}`;
        
        const bestScore = (currentGameMode === 'voice')
            ? (voiceCustomStageHighScores[customStage.id] || 0)
            : (customStageHighScores[customStage.id] || 0);

        btn.innerHTML = `
            <span>⭐ ${customStage.name}</span>
            <span class="stage-btn-sub">${t.bestScoreLabel}${bestScore}</span>
        `;

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-stage-btn';
        delBtn.textContent = '✖';
        delBtn.title = '削除';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`「${customStage.name}」を削除しますか？`)) {
                customStages.splice(cIndex, 1);
                delete customStageHighScores[customStage.id];
                delete voiceCustomStageHighScores[customStage.id];
                localStorage.setItem('sushiGameCustomStages', JSON.stringify(customStages));
                localStorage.setItem('sushiGameCustomStageScores', JSON.stringify(customStageHighScores));
                localStorage.setItem('sushiGameVoiceCustomStageScores', JSON.stringify(voiceCustomStageHighScores));
                renderStages();
            }
        };
        btn.appendChild(delBtn);

        btn.onclick = () => {
            currentStageIndex = stageKey;
            startSelectedMode();
        };

        container.appendChild(btn);
    });
}

function renderStore() {
    const totalScoreFlick = getTotalBestScore('flick');
    if (storeTotalScore) storeTotalScore.textContent = totalScoreFlick;
    
    const container = document.getElementById('theme-list-container');
    container.innerHTML = '';
    const t = i18n[currentLang];

    if (typeof themes !== 'undefined') {
        themes.forEach((theme, index) => {
            const btn = document.createElement('button');
            const requiredTotalScore = theme.unlockScore;
            
            const currentModeScore = getTotalBestScore(theme.mode || 'flick');
            const isUnlocked = currentModeScore >= requiredTotalScore;
            const themeName = t.themes && t.themes[index] ? t.themes[index] : theme.id;
            
            if (isUnlocked) {
                btn.className = `selection-btn ${activeThemeId === theme.id ? 'active' : ''}`;
                btn.style.backgroundColor = theme.color || '#d32f2f';
                const appliedText = currentLang === 'ja' ? ' (適用中)' : ' (Applied)';
                const changeText = currentLang === 'ja' ? 'に変更' : ' Apply';
                btn.textContent = activeThemeId === theme.id ? `✅ ${themeName}${appliedText}` : `✨ ${themeName}${changeText}`;
                
                btn.onclick = () => {
                    document.body.className = theme.id;
                    activeThemeId = theme.id;
                    localStorage.setItem('sushiGameTheme', activeThemeId);
                    renderStore();
                };
            } else {
                btn.className = 'selection-btn';
                btn.disabled = true;
                btn.style.backgroundColor = '#9e9e9e';
                const modeNameLabel = theme.mode === 'voice' ? (currentLang === 'ja' ? '音声モード' : 'Voice') : (currentLang === 'ja' ? 'フリックモード' : 'Flick');
                btn.textContent = `🔒 ${themeName} (${t.unlockLabel}${requiredTotalScore} [${modeNameLabel}]${t.unlockSuffix})`;
            }
            container.appendChild(btn);
        });
    }
}

function showScreen(screen) {
    homeScreen.classList.add('hidden');
    modeSelectScreen.classList.add('hidden');
    stageScreen.classList.add('hidden');
    createStageScreen.classList.add('hidden');
    storeScreen.classList.add('hidden');
    zukanScreen.classList.add('hidden');
    zukanModal.classList.add('hidden');
    settingScreen.classList.add('hidden');
    langScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    voiceGameScreen.classList.add('hidden');
    gameOverModal.classList.remove('show');
    screen.classList.remove('hidden');

    if (screen === homeScreen) {
        homeKanjiBg.style.display = 'block';
        if (homeFlickTotalScore) homeFlickTotalScore.textContent = getTotalBestScore('flick');
        if (homeVoiceTotalScore) homeVoiceTotalScore.textContent = getTotalBestScore('voice');
    } else {
        homeKanjiBg.style.display = 'none';
    }

    if (screen === stageScreen) renderStages();
    if (screen === storeScreen) renderStore();
    if (screen === zukanScreen) renderZukan();
    if (screen === settingScreen) updateSettingsButtonText();
}

showScreen(homeScreen);

// ボタンイベント紐付け
document.getElementById('goto-mode-select-btn').addEventListener('click', () => showScreen(modeSelectScreen));
document.getElementById('mode-flick-btn').addEventListener('click', () => {
    currentGameMode = 'flick';
    showScreen(stageScreen);
});
document.getElementById('mode-voice-speech-btn').addEventListener('click', () => {
    currentGameMode = 'voice';
    showScreen(stageScreen);
});

document.getElementById('go-store-btn').addEventListener('click', () => showScreen(storeScreen));
document.getElementById('goto-zukan-btn').addEventListener('click', () => showScreen(zukanScreen));
document.getElementById('goto-setting-btn').addEventListener('click', () => showScreen(settingScreen));
document.getElementById('goto-lang-screen-btn').addEventListener('click', () => showScreen(langScreen));
document.getElementById('goto-create-stage-btn').addEventListener('click', () => showScreen(createStageScreen));

document.getElementById('mode-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('stage-back-btn').addEventListener('click', () => showScreen(modeSelectScreen));
document.getElementById('create-back-btn').addEventListener('click', () => showScreen(stageScreen));
document.getElementById('back-home-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('zukan-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('setting-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('lang-back-btn').addEventListener('click', () => showScreen(settingScreen));

document.getElementById('modal-home-btn').addEventListener('click', () => {
    if (homeFlickTotalScore) homeFlickTotalScore.textContent = getTotalBestScore('flick');
    if (homeVoiceTotalScore) homeVoiceTotalScore.textContent = getTotalBestScore('voice');
    stopVoiceRecognition();
    showScreen(homeScreen);
});

document.getElementById('save-stage-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('custom-stage-name').value.trim();
    const wordsInput = document.getElementById('custom-stage-words').value.trim();

    if (!nameInput) {
        alert('ステージの名前を入力してください。');
        return;
    }
    if (!wordsInput) {
        alert('単語リストを入力してください。');
        return;
    }

    const lines = wordsInput.split('\n');
    const parsedWords = [];

    lines.forEach(line => {
        const parts = line.split(/[,，]/);
        if (parts.length >= 2) {
            const ja = parts[0].trim();
            const en = parts[1].trim();
            if (ja && en) {
                parsedWords.push({
                    hiragana: ja,
                    speak: ja,
                    romaji: "",
                    english: en,
                    emoji: "🍣"
                });
            }
        }
    });

    if (parsedWords.length < 2) {
        alert('単語は少なくとも2つ以上入力してください。（形式: 日本語, 英語）');
        return;
    }

    const newCustomStage = {
        id: Date.now(),
        name: nameInput,
        words: parsedWords
    };

    customStages.push(newCustomStage);
    localStorage.setItem('sushiGameCustomStages', JSON.stringify(customStages));

    document.getElementById('custom-stage-name').value = '';
    document.getElementById('custom-stage-words').value = '';

    alert(`「${nameInput}」ステージを作成しました！`);
    showScreen(stageScreen);
});

document.getElementById('toggle-hint-btn').addEventListener('click', () => {
    showHint = !showHint;
    localStorage.setItem('sushiGameHint', showHint);
    updateSettingsButtonText();
});

document.getElementById('toggle-voice-btn').addEventListener('click', () => {
    enableVoice = !enableVoice;
    localStorage.setItem('sushiGameVoice', enableVoice);
    updateSettingsButtonText();
});

document.getElementById('reset-record-btn').addEventListener('click', () => {
    const t = i18n[currentLang];
    if (confirm(t.resetConfirm)) {
        localStorage.removeItem('sushiGameStageScores');
        localStorage.removeItem('sushiGameCustomStageScores');
        localStorage.removeItem('sushiGameVoiceStageScores');
        localStorage.removeItem('sushiGameVoiceCustomStageScores');
        localStorage.removeItem('sushiGameTheme');
        localStorage.removeItem('sushiGameHint');
        localStorage.removeItem('sushiGameVoice');
        localStorage.removeItem('sushiGameWrongWords');
        
        stageHighScores = [0, 0, 0, 0, 0];
        customStageHighScores = {};
        voiceStageHighScores = [0, 0, 0, 0, 0];
        voiceCustomStageHighScores = {};
        
        activeThemeId = 'theme-default';
        showHint = true;
        enableVoice = true;
        document.body.className = activeThemeId;
        if (homeFlickTotalScore) homeFlickTotalScore.textContent = getTotalBestScore('flick');
        if (homeVoiceTotalScore) homeVoiceTotalScore.textContent = getTotalBestScore('voice');
        updateSettingsButtonText();
        alert(t.resetDone);
    }
});

document.getElementById('lang-ja-btn').addEventListener('click', () => {
    currentLang = 'ja';
    localStorage.setItem('sushiGameLang', 'ja');
    applyLanguage();
});
document.getElementById('lang-en-btn').addEventListener('click', () => {
    currentLang = 'en';
    localStorage.setItem('sushiGameLang', 'en');
    applyLanguage();
});

function startSelectedMode() {
    if (currentGameMode === 'voice') {
        startVoiceGame();
    } else {
        startGame();
    }
}

// ==========================================
// ゲーム共通・ステージ単語取得
// ==========================================
function getActiveWordList() {
    const t = i18n[currentLang];
    if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
        const cId = parseInt(currentStageIndex.replace('custom_', ''));
        const foundCustom = customStages.find(s => s.id === cId);
        return foundCustom ? foundCustom.words : defaultStagesData[0].words;
    } else if (currentStageIndex === 4) {
        let wrongWords = JSON.parse(localStorage.getItem('sushiGameWrongWords')) || [];
        let pool = [...wrongWords];
        let allWords = [];
        for (let i = 0; i < 3; i++) {
            if(defaultStagesData[i]) allWords = allWords.concat(defaultStagesData[i].words);
        }
        let shuffledAll = [...allWords].sort(() => Math.random() - 0.5);
        for (let w of shuffledAll) {
            if (pool.length >= 18) break;
            if (!pool.some(item => item.hiragana === w.hiragana)) pool.push(w);
        }
        while (pool.length < 18 && allWords.length > 0) {
            pool.push(allWords[Math.floor(Math.random() * allWords.length)]);
        }
        return pool;
    } else if (currentStageIndex === 3) {
        let allWords = [];
        defaultStagesData.forEach(s => allWords = allWords.concat(s.words));
        return allWords;
    } else {
        return defaultStagesData[currentStageIndex].words;
    }
}

function getStageTitleText() {
    const t = i18n[currentLang];
    if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
        const cId = parseInt(currentStageIndex.replace('custom_', ''));
        const foundCustom = customStages.find(s => s.id === cId);
        return foundCustom ? foundCustom.name : "";
    }
    return t.stages[currentStageIndex];
}

// ==========================================
// A. フリック（通常）モード ロジック
// ==========================================
const sushiContainer = document.getElementById('sushi-container');
const scoreDisplay = document.getElementById('score');
const timeDisplay = document.getElementById('time');
const topWord = document.getElementById('top-word');
const bottomWord = document.getElementById('bottom-word');
const resultMessage = document.getElementById('result-message');
const currentStageNameDisplay = document.getElementById('current-stage-name');

let sushiX = 0, speed = 4, GAME_TIME = 30;
let timeLeft = GAME_TIME, currentScore = 0;
let correctLane = "", isProcessing = false, isGameOver = true, timerId = null;
let activeWordList = [];

function updateFeverUI() {
    if (feverTurns > 0) {
        gameScreen.classList.add('fever-lane');
        voiceGameScreen.classList.add('fever-lane');
    } else {
        gameScreen.classList.remove('fever-lane');
        voiceGameScreen.classList.remove('fever-lane');
    }
}

function startGame() {
    showScreen(gameScreen);
    currentScore = 0;
    timeLeft = GAME_TIME;
    isGameOver = false;
    lastWordIndex = -1;
    successStreak = 0;
    feverTurns = 0;
    updateFeverUI();
    scoreDisplay.textContent = currentScore;
    timeDisplay.textContent = timeLeft;
    newRecordMsg.textContent = "";
    
    currentStageNameDisplay.textContent = getStageTitleText();
    activeWordList = getActiveWordList();

    if (showHint) {
        isWaitingForTutorial = true;
        tutorialOverlay.classList.remove('hidden');
        showHint = false;
        localStorage.setItem('sushiGameHint', false);
    } else {
        isWaitingForTutorial = false;
        tutorialOverlay.classList.add('hidden');
    }
    
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
        if (isGameOver || isWaitingForTutorial) return;
        timeLeft--;
        timeDisplay.textContent = timeLeft;
        if (timeLeft <= 0) endGame();
    }, 1000);

    setNextQuestion();
}

document.getElementById('tutorial-ok-btn').addEventListener('click', () => {
    tutorialOverlay.classList.add('hidden');
    isWaitingForTutorial = false;
});

let currentCorrectWord = null;

function setNextQuestion() {
    if (isGameOver) return;
    sushiContainer.className = "";
    isProcessing = false;

    let correctIndex;
    do {
        correctIndex = Math.floor(Math.random() * activeWordList.length);
    } while (activeWordList.length > 1 && correctIndex === lastWordIndex);
    
    lastWordIndex = correctIndex;
    const correct = activeWordList[correctIndex];
    currentCorrectWord = correct;

    playWordAudio(correct);

    let dummyIndex;
    do {
        dummyIndex = Math.floor(Math.random() * activeWordList.length);
    } while (dummyIndex === correctIndex);
    const dummy = activeWordList[dummyIndex];

    document.getElementById('sushi-hiragana').textContent = correct.hiragana;
    document.getElementById('sushi-romaji').textContent = correct.romaji || "";

    const correctEmoji = correct.emoji || '🍣';
    const dummyEmoji = dummy.emoji || '🍣';

    if (Math.random() < 0.5) {
        topWord.textContent = `${correctEmoji} ${correct.english}`;
        bottomWord.textContent = `${dummyEmoji} ${dummy.english}`;
        correctLane = "top";
    } else {
        topWord.textContent = `${dummyEmoji} ${dummy.english}`;
        bottomWord.textContent = `${correctEmoji} ${correct.english}`;
        correctLane = "bottom";
    }

    sushiX = window.innerWidth;
    sushiContainer.style.left = sushiX + 'px';
}

function handleSuccess() {
    successStreak++;
    
    let basePoints = 10;
    if (successStreak === 2) basePoints = 30;
    else if (successStreak === 3) basePoints = 50;
    else if (successStreak >= 4) basePoints = 100;

    if (successStreak === 10 && feverTurns === 0) {
        feverTurns = 3;
        timeLeft += 3;
        timeDisplay.textContent = timeLeft;
        voiceTimeDisplay.textContent = timeLeft;
        updateFeverUI();
    }

    let points = basePoints;
    const isFever = feverTurns > 0;
    if (isFever) {
        points *= 2;
    }

    if (currentGameMode === 'voice') {
        voiceCurrentScore += points;
        voiceScoreDisplay.textContent = voiceCurrentScore;
    } else {
        currentScore += points;
        scoreDisplay.textContent = currentScore;
    }

    const t = i18n[currentLang];
    let msg = isFever ? `${t.fever} (+${points})` : `${t.success} (+${points})`;
    
    showMessage(msg, "success", isFever);

    if (isFever) {
        feverTurns--;
        updateFeverUI();
    }
}

function handleMiss() {
    successStreak = 0;
    const t = i18n[currentLang];
    const targetWord = (currentGameMode === 'voice') ? currentVoiceWord : currentCorrectWord;
    if (targetWord) {
        recordWrongWord(targetWord);
    }

    if (feverTurns > 0) {
        showMessage(t.fever, "success", true);
        feverTurns--;
        updateFeverUI();
    } else {
        if (currentGameMode === 'voice') {
            voiceCurrentScore = Math.max(0, voiceCurrentScore - 50);
            voiceScoreDisplay.textContent = voiceCurrentScore;
        } else {
            currentScore = Math.max(0, currentScore - 50);
            scoreDisplay.textContent = currentScore;
        }
        showMessage(t.miss, "miss", false);
    }
}

function sortSushi(direction) {
    if (isProcessing || isGameOver || isWaitingForTutorial) return;
    isProcessing = true;
    
    if (direction === correctLane) {
        handleSuccess();
    } else {
        handleMiss();
    }
    
    sushiContainer.classList.add(direction === 'top' ? 'move-top' : 'move-bottom');
    setTimeout(setNextQuestion, 300);
}

function showMessage(text, type, isRainbow = false) {
    const targetMsgEl = (currentGameMode === 'voice') ? voiceResultMessage : resultMessage;
    targetMsgEl.textContent = text;
    targetMsgEl.className = `${type} show`;
    if (isRainbow) {
        targetMsgEl.classList.add('fever-rainbow');
    } else {
        targetMsgEl.classList.remove('fever-rainbow');
    }
    setTimeout(() => { 
        targetMsgEl.className = ""; 
    }, 400);
}

function endGame() {
    isGameOver = true;
    if (timerId) clearInterval(timerId);
    if (voiceTimerId) clearInterval(voiceTimerId);
    feverTurns = 0;
    updateFeverUI();

    const t = i18n[currentLang];

    if (currentGameMode === 'voice') {
        const finalScore = voiceCurrentScore;
        document.getElementById('final-score').textContent = finalScore;

        if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
            const cId = parseInt(currentStageIndex.replace('custom_', ''));
            if (finalScore > (voiceCustomStageHighScores[cId] || 0)) {
                voiceCustomStageHighScores[cId] = finalScore;
                localStorage.setItem('sushiGameVoiceCustomStageScores', JSON.stringify(voiceCustomStageHighScores));
                newRecordMsg.textContent = t.newRecord;
            } else {
                newRecordMsg.textContent = "";
            }
        } else {
            if (finalScore > (voiceStageHighScores[currentStageIndex] || 0)) {
                voiceStageHighScores[currentStageIndex] = finalScore;
                localStorage.setItem('sushiGameVoiceStageScores', JSON.stringify(voiceStageHighScores));
                newRecordMsg.textContent = t.newRecord;
            } else {
                newRecordMsg.textContent = "";
            }
        }
    } else {
        const finalScore = currentScore;
        document.getElementById('final-score').textContent = finalScore;

        if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
            const cId = parseInt(currentStageIndex.replace('custom_', ''));
            if (finalScore > (customStageHighScores[cId] || 0)) {
                customStageHighScores[cId] = finalScore;
                localStorage.setItem('sushiGameCustomStageScores', JSON.stringify(customStageHighScores));
                newRecordMsg.textContent = t.newRecord;
            } else {
                newRecordMsg.textContent = "";
            }
        } else {
            if (finalScore > (stageHighScores[currentStageIndex] || 0)) {
                stageHighScores[currentStageIndex] = finalScore;
                localStorage.setItem('sushiGameStageScores', JSON.stringify(stageHighScores));
                newRecordMsg.textContent = t.newRecord;
            } else {
                newRecordMsg.textContent = "";
            }
        }
    }
    
    gameOverModal.classList.add('show');
}

function update() {
    if (currentGameMode === 'flick' && !isProcessing && !isGameOver && !isWaitingForTutorial) {
        sushiX -= speed;
        const containerWidth = sushiContainer.offsetWidth || 200;
        if (sushiX < -containerWidth) {
            handleMiss();
            setNextQuestion();
        } else {
            sushiContainer.style.left = sushiX + 'px';
        }
    }
    requestAnimationFrame(update);
}
update(); 

// キーボード操作（PC用）
window.addEventListener('keydown', (e) => {
    if (currentGameMode !== 'flick' || isGameOver || isWaitingForTutorial) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); sortSushi('top'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); sortSushi('bottom'); }
});

// スマホ向けタッチ・スワイプ操作
let touchStartY = 0;
gameScreen.addEventListener('touchstart', (e) => {
    if (currentGameMode !== 'flick' || isGameOver || isWaitingForTutorial) return;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

gameScreen.addEventListener('touchend', (e) => {
    if (currentGameMode !== 'flick' || isGameOver || isWaitingForTutorial) return;
    let touchEndY = e.changedTouches[0].clientY;
    let diffY = touchEndY - touchStartY;

    // 30px以上上下にスワイプされた場合
    if (Math.abs(diffY) > 30) {
        if (diffY < 0) {
            sortSushi('top');    // 上スワイプ
        } else {
            sortSushi('bottom'); // 下スワイプ
        }
    }
}, { passive: true });

// 上下レーンの直接タップ操作
document.getElementById('top-lane').addEventListener('click', () => {
    if (currentGameMode === 'flick' && !isGameOver && !isWaitingForTutorial) {
        sortSushi('top');
    }
});
document.getElementById('bottom-lane').addEventListener('click', () => {
    if (currentGameMode === 'flick' && !isGameOver && !isWaitingForTutorial) {
        sortSushi('bottom');
    }
});


// ==========================================
// B. 音声発話（ボイス）モード ロジック
// ==========================================
const voiceScoreDisplay = document.getElementById('voice-score');
const voiceTimeDisplay = document.getElementById('voice-time');
const voiceStageNameDisplay = document.getElementById('voice-current-stage-name');
const voiceHiraganaSpan = document.getElementById('voice-sushi-hiragana');
const voiceRomajiSpan = document.getElementById('voice-sushi-romaji');
const voiceStatusHint = document.getElementById('voice-status-hint');
const voiceResultMessage = document.getElementById('voice-result-message');
const voiceSushiContainer = document.getElementById('voice-sushi-container');

let voiceTimerId = null;
let voiceTimeLeft = 30;
let voiceCurrentScore = 0;
let voiceActiveWordList = [];
let currentVoiceWord = null;
let recognition = null;
let isVoiceGameActive = false;
let isVoiceAnimating = false;

function startVoiceGame() {
    showScreen(voiceGameScreen);
    voiceCurrentScore = 0;
    voiceTimeLeft = GAME_TIME;
    isVoiceGameActive = false;
    isVoiceAnimating = false;
    isGameOver = false;
    lastWordIndex = -1;
    successStreak = 0;
    feverTurns = 0;
    updateFeverUI();

    voiceScoreDisplay.textContent = voiceCurrentScore;
    voiceTimeDisplay.textContent = voiceTimeLeft;
    voiceStageNameDisplay.textContent = getStageTitleText();
    voiceActiveWordList = getActiveWordList();
    newRecordMsg.textContent = "";

    if (voiceTimerId) clearInterval(voiceTimerId);
    voiceTimerId = setInterval(() => {
        if (isGameOver) return;
        voiceTimeLeft--;
        voiceTimeDisplay.textContent = voiceTimeLeft;
        if (voiceTimeLeft <= 0) {
            stopVoiceRecognition();
            endGame();
        }
    }, 1000);

    initSpeechRecognition();
    setNextVoiceQuestion();
}

function setNextVoiceQuestion() {
    if (isGameOver) return;
    isVoiceGameActive = false;
    isVoiceAnimating = false;

    let correctIndex;
    do {
        correctIndex = Math.floor(Math.random() * voiceActiveWordList.length);
    } while (voiceActiveWordList.length > 1 && correctIndex === lastWordIndex);

    lastWordIndex = correctIndex;
    currentVoiceWord = voiceActiveWordList[correctIndex];

    playWordAudio(currentVoiceWord);

    voiceRomajiSpan.textContent = currentVoiceWord.romaji || currentVoiceWord.hiragana;
    voiceHiraganaSpan.textContent = currentVoiceWord.hiragana;

    const t = i18n[currentLang];
    const displayRomaji = currentVoiceWord.romaji || currentVoiceWord.hiragana;
    voiceStatusHint.textContent = `${t.voiceHintPrompt} 「${displayRomaji}」`;

    voiceSushiContainer.style.transition = 'none';
    voiceSushiContainer.style.left = '150vw';
    voiceSushiContainer.style.transform = 'translate(-50%, -50%)';
    voiceSushiContainer.style.opacity = '0';

    void voiceSushiContainer.offsetWidth;
    voiceSushiContainer.style.transition = 'left 0.4s ease-out, opacity 0.4s ease-out';
    voiceSushiContainer.style.left = '50%';
    voiceSushiContainer.style.opacity = '1';

    setTimeout(() => {
        if (!isGameOver) {
            isVoiceGameActive = true;
        }
    }, 400);
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("お使いのブラウザは音声認識に対応していません（Google ChromeやSafariをご利用ください）。");
        return;
    }

    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        if (!isVoiceGameActive || isVoiceAnimating || isGameOver) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const transcript = event.results[i][0].transcript.trim().replace(/[。、！？]/g, "");
                checkVoiceAnswer(transcript);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("音声認識エラー:", event.error);
    };

    recognition.onend = () => {
        if (!isGameOver && currentGameMode === 'voice') {
            try { recognition.start(); } catch(e) {}
        }
    };

    try {
        recognition.start();
    } catch(e) {}
}

function stopVoiceRecognition() {
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }
}

function checkVoiceAnswer(spokenText) {
    if (!currentVoiceWord || !isVoiceGameActive || isVoiceAnimating) return;

    const targetJa = currentVoiceWord.hiragana.replace(/\s+/g, "");
    const targetSpeak = (currentVoiceWord.speak || "").replace(/\s+/g, "");
    const targetRomaji = (currentVoiceWord.romaji || "").toLowerCase().replace(/\s+/g, "");
    const cleanSpoken = spokenText.toLowerCase().replace(/\s+/g, "");

    const isCorrect = cleanSpoken.includes(targetJa) || 
                      (targetSpeak && cleanSpoken.includes(targetSpeak)) || 
                      (targetRomaji && cleanSpoken.includes(targetRomaji));

    if (isCorrect) {
        isVoiceGameActive = false;
        isVoiceAnimating = true;

        handleSuccess();

        voiceRomajiSpan.textContent = currentVoiceWord.romaji || currentVoiceWord.hiragana;
        voiceHiraganaSpan.textContent = `✨ ${currentVoiceWord.english} ✨`;

        voiceStatusHint.textContent = `正解！🎉`;
        
        showVoiceSuccessMessage(currentVoiceWord.english);

        voiceSushiContainer.style.transition = 'left 0.4s ease-in, opacity 0.4s ease-in';
        voiceSushiContainer.style.left = '-50vw';
        voiceSushiContainer.style.opacity = '0';

        setTimeout(() => {
            if (!isGameOver) {
                setNextVoiceQuestion();
            }
        }, 1000);
    }
}

function showVoiceSuccessMessage(englishWord) {
    voiceResultMessage.innerHTML = `SUCCESS!<br><span style="font-size: 60px; color: #ffccbc;">${englishWord}</span>`;
    voiceResultMessage.className = `success show`;
    setTimeout(() => {
        voiceResultMessage.className = "";
        voiceResultMessage.innerHTML = "";
    }, 900);
}