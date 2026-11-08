// --- データ管理 ---
let currentLang = localStorage.getItem('sushiGameLang') || 'ja';
let stageHighScores = JSON.parse(localStorage.getItem('sushiGameStageScores')) || [0, 0, 0, 0, 0];
let customStages = JSON.parse(localStorage.getItem('sushiGameCustomStages')) || [];
let customStageHighScores = JSON.parse(localStorage.getItem('sushiGameCustomStageScores')) || {};

let activeThemeId = localStorage.getItem('sushiGameTheme') || 'theme-default';
let showHint = localStorage.getItem('sushiGameHint') !== 'false';
let enableVoice = localStorage.getItem('sushiGameVoice') !== 'false';

let currentStageIndex = 0;
let lastWordIndex = -1;
let successStreak = 0;
let feverTurns = 0; 
let isWaitingForTutorial = false;

document.body.className = activeThemeId;

// --- 音声ボイスの選択・設定ロジック ---
let selectedJapaneseVoice = null;

function updateJapaneseVoices() {
    if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));

        // 優先順位:
        // 1. 名前に Nanami と Natural を含む声
        let targetVoice = japaneseVoices.find(v => v.name.includes('Nanami') && v.name.includes('Natural'));

        // 2. Google 日本語
        if (!targetVoice) {
            targetVoice = japaneseVoices.find(v => v.name.includes('Google 日本語') || v.name.includes('Google Japanese'));
        }

        // 3. それ以外の日本語の声
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

// 音声ファイルを再生し、失敗した場合は speechSynthesis にフォールバックする関数
function playWordAudio(word, force = false) {
    if (!enableVoice && !force) return;

    // 前の音が鳴っていれば止める
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
        // 再生成功
    }).catch((error) => {
        // ファイルが見つからない等の場合は従来の speechSynthesis で読み上げ
        currentAudio = null;
        speakJapanese(speakText, force);
    });
}

// --- 音声発話関数 (Web Speech API) ---
function speakJapanese(text, force = false) {
    if ((enableVoice || force) && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9; // 読み上げスピードを 0.9 に設定
        if (selectedJapaneseVoice) {
            utterance.voice = selectedJapaneseVoice;
        }
        window.speechSynthesis.speak(utterance);
    }
}

function getTotalBestScore() {
    return stageHighScores.reduce((sum, score) => sum + score, 0);
}

// --- 画面要素 ---
const homeScreen = document.getElementById('home-screen');
const stageScreen = document.getElementById('stage-screen');
const createStageScreen = document.getElementById('create-stage-screen');
const storeScreen = document.getElementById('store-screen');
const zukanScreen = document.getElementById('zukan-screen');
const zukanModal = document.getElementById('zukan-modal');
const settingScreen = document.getElementById('setting-screen');
const langScreen = document.getElementById('lang-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverModal = document.getElementById('game-over-modal');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const homeKanjiBg = document.getElementById('home-kanji-bg');

const homeTotalScore = document.getElementById('home-total-score');
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

homeTotalScore.textContent = getTotalBestScore();
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
        const bestScoreForStage = stageHighScores[index] || 0;
        
        btn.innerHTML = `
            <span>${stageLabelPrefix}${stageName}</span>
            <span class="stage-btn-sub">${t.bestScoreLabel}${bestScoreForStage}</span>
        `;
        
        btn.onclick = () => {
            currentStageIndex = index;
            startGame(); 
        };
        container.appendChild(btn);
    }

    customStages.forEach((customStage, cIndex) => {
        const stageKey = `custom_${customStage.id}`;
        const btn = document.createElement('button');
        btn.className = `selection-btn custom-stage-btn ${currentStageIndex === stageKey ? 'active' : ''}`;
        const bestScore = customStageHighScores[customStage.id] || 0;

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
                localStorage.setItem('sushiGameCustomStages', JSON.stringify(customStages));
                localStorage.setItem('sushiGameCustomStageScores', JSON.stringify(customStageHighScores));
                renderStages();
            }
        };
        btn.appendChild(delBtn);

        btn.onclick = () => {
            currentStageIndex = stageKey;
            startGame();
        };

        container.appendChild(btn);
    });
}

function renderStore() {
    const totalScore = getTotalBestScore();
    storeTotalScore.textContent = totalScore;
    const container = document.getElementById('theme-list-container');
    container.innerHTML = '';
    const t = i18n[currentLang];

    themes.forEach((theme, index) => {
        const btn = document.createElement('button');
        const requiredTotalScore = theme.unlockScore * 5;
        const isUnlocked = totalScore >= requiredTotalScore;
        const themeName = t.themes[index];
        
        if (isUnlocked) {
            btn.className = `selection-btn ${activeThemeId === theme.id ? 'active' : ''}`;
            btn.style.backgroundColor = theme.color;
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
            btn.textContent = `🔒 ${themeName} (${t.unlockLabel}${requiredTotalScore}${t.unlockSuffix})`;
        }
        container.appendChild(btn);
    });
}

function showScreen(screen) {
    homeScreen.classList.add('hidden');
    stageScreen.classList.add('hidden');
    createStageScreen.classList.add('hidden');
    storeScreen.classList.add('hidden');
    zukanScreen.classList.add('hidden');
    zukanModal.classList.add('hidden');
    settingScreen.classList.add('hidden');
    langScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    gameOverModal.classList.remove('show');
    screen.classList.remove('hidden');

    if (screen === homeScreen) {
        homeKanjiBg.style.display = 'block';
        homeTotalScore.textContent = getTotalBestScore();
    } else {
        homeKanjiBg.style.display = 'none';
    }

    if (screen === stageScreen) renderStages();
    if (screen === storeScreen) renderStore();
    if (screen === zukanScreen) renderZukan();
    if (screen === settingScreen) updateSettingsButtonText();
}

showScreen(homeScreen);

document.getElementById('goto-stage-btn').addEventListener('click', () => showScreen(stageScreen));
document.getElementById('goto-create-stage-btn').addEventListener('click', () => showScreen(createStageScreen));
document.getElementById('go-store-btn').addEventListener('click', () => showScreen(storeScreen));
document.getElementById('goto-zukan-btn').addEventListener('click', () => showScreen(zukanScreen));
document.getElementById('goto-setting-btn').addEventListener('click', () => showScreen(settingScreen));
document.getElementById('goto-lang-screen-btn').addEventListener('click', () => showScreen(langScreen));

document.getElementById('stage-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('create-back-btn').addEventListener('click', () => showScreen(stageScreen));
document.getElementById('back-home-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('zukan-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('setting-back-btn').addEventListener('click', () => showScreen(homeScreen));
document.getElementById('lang-back-btn').addEventListener('click', () => showScreen(settingScreen));

document.getElementById('modal-home-btn').addEventListener('click', () => {
    homeTotalScore.textContent = getTotalBestScore();
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
        localStorage.removeItem('sushiGameTheme');
        localStorage.removeItem('sushiGameHint');
        localStorage.removeItem('sushiGameVoice');
        localStorage.removeItem('sushiGameWrongWords');
        stageHighScores = [0, 0, 0, 0, 0];
        customStageHighScores = {};
        activeThemeId = 'theme-default';
        showHint = true;
        enableVoice = true;
        document.body.className = activeThemeId;
        homeTotalScore.textContent = getTotalBestScore();
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

// ==========================================
// ゲームのロジック
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
    } else {
        gameScreen.classList.remove('fever-lane');
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
    
    const t = i18n[currentLang];

    if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
        const cId = parseInt(currentStageIndex.replace('custom_', ''));
        const foundCustom = customStages.find(s => s.id === cId);
        if (foundCustom) {
            currentStageNameDisplay.textContent = foundCustom.name;
            activeWordList = foundCustom.words;
        } else {
            activeWordList = defaultStagesData[0].words;
        }
    } else if (currentStageIndex === 4) {
        currentStageNameDisplay.textContent = t.stages[4];
        let wrongWords = JSON.parse(localStorage.getItem('sushiGameWrongWords')) || [];
        let pool = [...wrongWords];

        let allWords = [];
        for (let i = 0; i < 3; i++) {
            if(defaultStagesData[i]) {
                allWords = allWords.concat(defaultStagesData[i].words);
            }
        }

        let shuffledAll = [...allWords].sort(() => Math.random() - 0.5);

        for (let w of shuffledAll) {
            if (pool.length >= 18) break;
            if (!pool.some(item => item.hiragana === w.hiragana)) {
                pool.push(w);
            }
        }

        while (pool.length < 18 && allWords.length > 0) {
            let randW = allWords[Math.floor(Math.random() * allWords.length)];
            pool.push(randW);
        }

        activeWordList = pool;
    } else if (currentStageIndex === 3) {
        currentStageNameDisplay.textContent = t.stages[3];
        let allWords = [];
        defaultStagesData.forEach(s => allWords = allWords.concat(s.words));
        activeWordList = allWords;
    } else {
        currentStageNameDisplay.textContent = t.stages[currentStageIndex];
        activeWordList = defaultStagesData[currentStageIndex].words;
    }

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

    // 音声ファイルの再生（失敗時はspeechSynthesisで読み上げ）
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
        updateFeverUI();
    }

    let points = basePoints;
    const isFever = feverTurns > 0;
    if (isFever) {
        points *= 2;
    }

    currentScore += points;
    scoreDisplay.textContent = currentScore;

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
    if (currentCorrectWord) {
        recordWrongWord(currentCorrectWord);
    }

    if (feverTurns > 0) {
        showMessage(t.fever, "success", true);
        feverTurns--;
        updateFeverUI();
    } else {
        currentScore = Math.max(0, currentScore - 50);
        showMessage(t.miss, "miss", false);
    }
    scoreDisplay.textContent = currentScore;
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
    resultMessage.textContent = text;
    resultMessage.className = `${type} show`;
    if (isRainbow) {
        resultMessage.classList.add('fever-rainbow');
    } else {
        resultMessage.classList.remove('fever-rainbow');
    }
    setTimeout(() => { 
        resultMessage.className = ""; 
    }, 400);
}

function endGame() {
    isGameOver = true;
    clearInterval(timerId);
    feverTurns = 0;
    updateFeverUI();
    document.getElementById('final-score').textContent = currentScore;
    const t = i18n[currentLang];
    
    if (typeof currentStageIndex === 'string' && currentStageIndex.startsWith('custom_')) {
        const cId = parseInt(currentStageIndex.replace('custom_', ''));
        if (currentScore > (customStageHighScores[cId] || 0)) {
            customStageHighScores[cId] = currentScore;
            localStorage.setItem('sushiGameCustomStageScores', JSON.stringify(customStageHighScores));
            newRecordMsg.textContent = t.newRecord;
        } else {
            newRecordMsg.textContent = "";
        }
    } else {
        if (currentScore > (stageHighScores[currentStageIndex] || 0)) {
            stageHighScores[currentStageIndex] = currentScore;
            localStorage.setItem('sushiGameStageScores', JSON.stringify(stageHighScores));
            newRecordMsg.textContent = t.newRecord;
        } else {
            newRecordMsg.textContent = "";
        }
    }
    
    gameOverModal.classList.add('show');
}

function update() {
    if (!isProcessing && !isGameOver && !isWaitingForTutorial) {
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

window.addEventListener('keydown', (e) => {
    if (isGameOver || isWaitingForTutorial) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); sortSushi('top'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); sortSushi('bottom'); }
});