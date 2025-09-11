// ===== MATCH DETAILS & PROFILE MANAGEMENT (match-details.js) =====
// 기능: 경기 상세 패널, 투표, 채팅, 프로필 편집, 라인업

// HTML 이스케이프 함수
function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/[&<>"'`]/g, s => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "`": "&#96;"
    }[s]));
}

// 경기 패널 열기/닫기
function openPanel(matchId) {
    loadMatchDetails(matchId);
    const matchDetailsPanel = document.getElementById("matchDetailsPanel");
    const overlay = document.getElementById("overlay");
    
    if (matchDetailsPanel && overlay) {
        matchDetailsPanel.classList.add("active");
        overlay.classList.add("active");
        document.body.style.overflow = "hidden";
    }
}

function closePanel() {
    const matchDetailsPanel = document.getElementById("matchDetailsPanel");
    const overlay = document.getElementById("overlay");
    
    if (matchDetailsPanel && overlay) {
        matchDetailsPanel.classList.remove("active");
        overlay.classList.remove("active");
        document.body.style.overflow = "";
    }
}

// 패널 닫기 이벤트 설정
const closePanelBtn = document.getElementById("closePanelBtn");
const overlay = document.getElementById("overlay");

if (closePanelBtn) {
    closePanelBtn.addEventListener("click", closePanel);
}
if (overlay) {
    overlay.addEventListener("click", closePanel);
}

// Firestore에서 단일 경기 정보 가져오기
async function getMatchDetailsById(matchId) {
    try {
        const docRef = window.firebase.doc(window.db, "matches", matchId);
        const docSnap = await window.firebase.getDoc(docRef);
        
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            console.warn(`경기 ID ${matchId}에 대한 데이터가 없습니다.`);
            return null;
        }
    } catch (error) {
        console.error("경기 정보 불러오기 실패:", error);
        return null;
    }
}

// 팀 라인업 가져오기
async function getTeamLineup(teamName) {
    try {
        const teamDocRef = window.firebase.doc(window.db, "teams", teamName);
        const teamDoc = await window.firebase.getDoc(teamDocRef);
        
        if (teamDoc.exists()) {
            const teamData = teamDoc.data();
            console.log(`${teamName} 팀 라인업 조회 성공:`, teamData.lineups);
            return teamData.lineups || { first: [], second: [], third: [] };
        } else {
            console.warn(`teams 컬렉션에서 ${teamName} 팀을 찾을 수 없습니다.`);
            return { first: [], second: [], third: [] };
        }
    } catch (error) {
        console.error(`${teamName} 팀 라인업 조회 실패:`, error);
        return { first: [], second: [], third: [] };
    }
}

// 경기 라인업 데이터 가져오기
async function getMatchLineups(matchDetails) {
    try {
        const homeTeamName = matchDetails.homeTeam;
        const awayTeamName = matchDetails.awayTeam;
        
        console.log(`라인업 조회 시작 - 홈팀: ${homeTeamName}, 원정팀: ${awayTeamName}`);
        
        const homeLineup = await getTeamLineup(homeTeamName);
        const awayLineup = await getTeamLineup(awayTeamName);
        
        const finalLineups = {
            home: homeLineup,
            away: awayLineup
        };
        
        // teams 컬렉션에서 라인업을 찾지 못한 경우 matches 컬렉션에서 폴백
        if (!homeLineup.first.length && !homeLineup.second.length && !homeLineup.third.length) {
            console.log(`${homeTeamName} 팀의 teams 컬렉션 라인업이 비어있음, matches 컬렉션에서 폴백`);
            if (matchDetails.lineups && matchDetails.lineups.home) {
                finalLineups.home = matchDetails.lineups.home;
            }
        }
        
        if (!awayLineup.first.length && !awayLineup.second.length && !awayLineup.third.length) {
            console.log(`${awayTeamName} 팀의 teams 컬렉션 라인업이 비어있음, matches 컬렉션에서 폴백`);
            if (matchDetails.lineups && matchDetails.lineups.away) {
                finalLineups.away = matchDetails.lineups.away;
            }
        }
        
        console.log("최종 라인업 데이터:", finalLineups);
        return finalLineups;
        
    } catch (error) {
        console.error("라인업 조회 중 오류 발생:", error);
        return matchDetails.lineups || {
            home: { first: [], second: [], third: [] },
            away: { first: [], second: [], third: [] }
        };
    }
}

// 투표 관련 함수들
async function saveVoteToFirestore(matchId, voteType) {
    const user = window.auth.currentUser;
    if (!user) return;

    const voteRef = window.firebase.doc(window.db, 'votes', `${matchId}_${user.uid}`);
    const voteSnap = await window.firebase.getDoc(voteRef);

    if (voteSnap.exists()) return null;

    await window.firebase.setDoc(voteRef, {
        matchId,
        uid: user.uid,
        voteType,
        votedAt: new Date()
    });

    const pointRef = window.firebase.doc(window.db, 'user_points', user.uid);
    const pointSnap = await window.firebase.getDoc(pointRef);
    if (!pointSnap.exists()) {
        await window.firebase.setDoc(pointRef, {
            points: 0,
            uid: user.uid
        });
        
        if (window.setupPointsListener) {
            window.setupPointsListener(user.uid);
        }
    }

    return true;
}

async function getVotingStatsFromFirestore(matchId) {
    const stats = { homeWin: 0, draw: 0, awayWin: 0, total: 0 };
    const querySnapshot = await window.firebase.getDocs(
        window.firebase.query(
            window.firebase.collection(window.db, 'votes'),
            window.firebase.where('matchId', '==', matchId)
        )
    );

    querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.voteType in stats) {
            stats[data.voteType]++;
            stats.total++;
        }
    });

    return stats;
}

async function hasUserVoted(matchId) {
    const user = window.auth.currentUser;
    if (!user) return false;

    const voteRef = window.firebase.doc(window.db, 'votes', `${matchId}_${user.uid}`);
    const voteSnap = await window.firebase.getDoc(voteRef);
    return voteSnap.exists();
}

function renderVotingGraph(container, stats) {
    const totalVotes = stats.total;
    
    if (totalVotes === 0) {
        container.innerHTML = `
            <div class="voting-stats">
                <div class="no-votes-message">
                    <p>아직 투표가 없습니다.</p>
                </div>
            </div>
        `;
        return;
    }
    
    const homePercent = Math.round((stats.homeWin / totalVotes) * 100);
    const drawPercent = Math.round((stats.draw / totalVotes) * 100);
    const awayPercent = Math.round((stats.awayWin / totalVotes) * 100);

    container.innerHTML = `
        <div class="voting-stats">
            <div class="stat-row">
                <div class="stat-value">${homePercent}%</div>
                <div class="stat-bar">
                    <div class="home-stat" style="width: ${homePercent}%"></div>
                    <div class="draw-stat" style="width: ${drawPercent}%"></div>
                    <div class="away-stat" style="width: ${awayPercent}%"></div>
                </div>
                <div class="stat-value">${awayPercent}%</div>
            </div>
            <div class="stat-labels">
                <span class="home-label">홈 승 (${stats.homeWin})</span>
                <span class="draw-label">무승부 (${stats.draw})</span>
                <span class="away-label">원정 승 (${stats.awayWin})</span>
            </div>
        </div>
    `;
}

// 경기 상세 정보 로드
async function loadMatchDetails(matchId) {
    const matchDetails = await getMatchDetailsById(matchId);
    if (!matchDetails) return;
    
    const panelTitle = document.getElementById("panelTitle");
    const panelContent = document.getElementById("panelContent");
    
    if (panelTitle) {
        panelTitle.textContent = `${matchDetails.homeTeam} vs ${matchDetails.awayTeam}`;
    }

    const isLoggedIn = !!window.auth.currentUser;
    const userVoted = isLoggedIn ? await hasUserVoted(matchId) : false;
    const stats = await getVotingStatsFromFirestore(matchId);

    let predictionHtml = "";
    
    // 경기가 finished 상태이고 관리자인 경우 결과 설정 버튼 표시
    if (matchDetails.status === "finished" && window.isAdmin && !matchDetails.adminResult) {
        predictionHtml = `
            <h3>경기 결과 설정 (관리자)</h3>
            <div class="admin-result-btns">
                <button class="admin-result-btn home-win" onclick="window.setMatchResult('${matchId}', 'homeWin')">홈팀 승</button>
                <button class="admin-result-btn draw" onclick="window.setMatchResult('${matchId}', 'draw')">무승부</button>
                <button class="admin-result-btn away-win" onclick="window.setMatchResult('${matchId}', 'awayWin')">원정팀 승</button>
            </div>
            <h3>승부예측 결과</h3><div id="votingStats"></div>
        `;
    }
    // 관리자가 결과를 이미 설정한 경우
    else if (matchDetails.status === "finished" && matchDetails.adminResult) {
        const resultText = {
            'homeWin': '홈팀 승',
            'draw': '무승부', 
            'awayWin': '원정팀 승'
        }[matchDetails.adminResult] || '결과 미정';
        
        predictionHtml = `
            <h3>경기 결과: ${resultText}</h3>
            <h3>승부예측 결과</h3><div id="votingStats"></div>
        `;
    }
    // 예정된 경기의 승부예측
    else if (matchDetails.status === "scheduled") {
        if (!isLoggedIn || userVoted) {
            predictionHtml = `<h3>승부예측 결과</h3><div id="votingStats"></div>`;
        } else {
            predictionHtml = `
                <h3>승부예측</h3>
                <div class="prediction-btns">
                    <button class="prediction-btn home-win" data-vote="homeWin">1</button>
                    <button class="prediction-btn draw" data-vote="draw">X</button>
                    <button class="prediction-btn away-win" data-vote="awayWin">2</button>
                </div>`;
        }
    }
    // 기타 경기 상태
    else {
        predictionHtml = `<h3>승부예측 결과</h3><div id="votingStats"></div>`;
    }

    if (panelContent) {
        panelContent.innerHTML = `
            <div class="match-date">${matchDetails.date}</div>
            <div class="match-league">${matchDetails.league}</div>
            <div class="match-score">
                <div class="team-name">${matchDetails.homeTeam}</div>
                <div class="score-display">${matchDetails.homeScore} - ${matchDetails.awayScore}</div>
                <div class="team-name">${matchDetails.awayTeam}</div>
            </div>
            <div class="prediction-container">${predictionHtml}</div>
            ${await renderPanelTabs(matchDetails, matchId)}
        `;
    }

    const statsContainer = panelContent?.querySelector('#votingStats');
    if (statsContainer) renderVotingGraph(statsContainer, stats);

    setupPanelTabs(matchId);

    // 일반 사용자 승부예측 버튼 이벤트
    const buttons = panelContent?.querySelectorAll('.prediction-btn');
    buttons?.forEach(btn => {
        btn.addEventListener('click', async () => {
            const voteType = btn.getAttribute("data-vote");
            const success = await saveVoteToFirestore(matchId, voteType);
            if (success) {
                const updatedStats = await getVotingStatsFromFirestore(matchId);
                const container = btn.closest('.prediction-container');
                container.innerHTML = `<h3>승부예측 결과</h3><div id="votingStats"></div>`;
                renderVotingGraph(container.querySelector('#votingStats'), updatedStats);
            }
        });
    });
}

// 패널 탭 렌더링
async function renderPanelTabs(matchDetails, matchId) {
    const lineups = await getMatchLineups(matchDetails);
    
    return `
        <div class="tab-container">
            <div class="tabs">
                <div class="tab active" data-tab="lineup">라인업</div>
                <div class="tab" data-tab="chat">채팅</div>
            </div>
            <div class="tab-contents">
                <div class="tab-content lineup-content active">
                    ${renderLineup(lineups)}
                </div>
                <div class="tab-content chat-content">
                    ${renderChatBox(matchId)}
                </div>
            </div>
        </div>
    `;
}

// 라인업 렌더링
function renderLineup(lineups) {
    function players(list) {
        return `<div class="players-container">${list.map((n) => `<div class="player">${escapeHtml(n)}</div>`).join("")}</div>`;
    }
    function sideBlock(side, data) {
        return `
            <div class="lineup-team lineup-${side}">
                <div class="lineup-group"><span class="position-label">3학년</span>${players(data.third || [])}</div>
                <div class="lineup-group"><span class="position-label">2학년</span>${players(data.second || [])}</div>
                <div class="lineup-group"><span class="position-label">1학년</span>${players(data.first || [])}</div>
            </div>
        `;
    }
    return `
        <div class="lineup-field">
            <div class="lineup-bg"></div>
            <div class="lineup-sides">
                ${sideBlock("home", lineups.home)}
                <div class="vs-label">VS</div>
                ${sideBlock("away", lineups.away)}
            </div>
        </div>
    `;
}

// 채팅 박스 렌더링
function renderChatBox(matchId) {
    return `
        <div class="chat-messages" id="chatMessages"></div>
        <form class="chat-form" id="chatForm">
            <input type="text" id="chatInput" autocomplete="off" maxlength="120" placeholder="메시지를 입력하세요" />
            <button type="submit" id="sendChatBtn">전송</button>
        </form>
        <div class="chat-login-notice" style="display:none;">
            <button class="login-btn" onclick="document.getElementById('loginModal').style.display='flex'">로그인 후 채팅하기</button>
        </div>
    `;
}

// 채팅 Firestore 경로
function chatCollection(matchId) {
    return window.firebase.collection(window.db, 'match_chats', matchId, 'messages');
}

// 패널 탭 기능 설정
function setupPanelTabs(matchId) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach((tab, index) => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            contents[index].classList.add('active');
            
            if (tab.dataset.tab === "chat") {
                setupChat(matchId);
            }
        };
    });
    
    if (tabs.length > 0 && contents.length > 0) {
        tabs[0].classList.add('active');
        contents[0].classList.add('active');
    }
}

// 채팅 기능
function setupChat(matchId) {
    const chatBox = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const loginNotice = document.querySelector('.chat-login-notice');
    
    if (!chatBox || !chatForm || !chatInput || !loginNotice) return;
    
    chatBox.innerHTML = "";

    if (!window.auth.currentUser) {
        loginNotice.style.display = "block";
        chatForm.style.display = "none";
        chatBox.innerHTML = "<p style='text-align:center;color:#aaa;'>로그인 후 채팅을 이용할 수 있습니다.</p>";
        return;
    } else {
        loginNotice.style.display = "none";
        chatForm.style.display = "flex";
    }

    if (window.chatUnsubscribe) window.chatUnsubscribe();

    window.chatUnsubscribe = window.firebase.onSnapshot(
        window.firebase.query(
            chatCollection(matchId),
            window.firebase.where('matchId', '==', matchId)
        ),
        (snapshot) => {
            let html = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.uid === window.auth.currentUser.uid;
                html += `
                    <div class="chat-msg${isMe ? " me" : ""}">
                        <span class="chat-nick">${escapeHtml(msg.nickname)}</span>
                        <span class="chat-text">${escapeHtml(msg.text)}</span>
                        <span class="chat-time">${msg.time ? new Date(msg.time.seconds * 1000).toLocaleTimeString() : ""}</span>
                    </div>
                `;
            });
            chatBox.innerHTML = html;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    );

    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        const user = window.auth.currentUser;
        if (!user) return;
        const profileSnap = await window.firebase.getDoc(window.firebase.doc(window.db, 'profiles', user.uid));
        const nickname = profileSnap.exists() ? profileSnap.data().nickname : user.email.split('@')[0];
        await window.firebase.setDoc(
            window.firebase.doc(chatCollection(matchId), Date.now().toString() + "_" + user.uid),
            {
                matchId,
                uid: user.uid,
                nickname,
                text,
                time: new Date()
            }
        );
        chatInput.value = "";
        setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 100);
    };
}

// ===== 프로필 편집 관련 함수들 =====

// 프로필 편집 모달 이벤트 설정
function setupProfileEditModalEvents() {
    console.log("=== 프로필 편집 모달 이벤트 설정 시작 ===");
    
    const closeProfileEditModal = document.getElementById('closeProfileEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const profileEditModal = document.getElementById('profileEditModal');
    const changeImageBtn = document.getElementById('changeImageBtn');
    const imageFileInput = document.getElementById('imageFileInput');
    const cancelImageBtn = document.getElementById('cancelImageBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    
    console.log("프로필 편집 모달 요소들 확인:", {
        closeProfileEditModal: !!closeProfileEditModal,
        cancelEditBtn: !!cancelEditBtn,
        profileEditModal: !!profileEditModal,
        changeImageBtn: !!changeImageBtn,
        imageFileInput: !!imageFileInput,
        cancelImageBtn: !!cancelImageBtn,
        saveProfileBtn: !!saveProfileBtn
    });
    
    if (closeProfileEditModal) {
        closeProfileEditModal.onclick = () => {
            console.log("닫기 버튼 클릭됨");
            if (profileEditModal) profileEditModal.style.display = 'none';
        };
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.onclick = () => {
            console.log("취소 버튼 클릭됨");
            if (profileEditModal) profileEditModal.style.display = 'none';
        };
    }

    if (profileEditModal) {
        profileEditModal.onclick = (e) => {
            if (e.target === profileEditModal) {
                console.log("모달 배경 클릭됨");
                profileEditModal.style.display = 'none';
            }
        };
    }
    
    if (changeImageBtn) {
        changeImageBtn.onclick = () => {
            console.log("이미지 변경 버튼 클릭됨");
            if (imageFileInput) {
                imageFileInput.click();
            }
        };
    }
    
    if (imageFileInput) {
        imageFileInput.onchange = (e) => {
            const file = e.target.files[0];
            console.log("파일 선택됨:", file ? file.name : 'none');
            
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    alert('파일 크기가 너무 큽니다. 5MB 이하의 이미지를 선택해주세요.');
                    return;
                }
                
                if (!file.type.startsWith('image/')) {
                    alert('이미지 파일만 업로드할 수 있습니다.');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imagePreview = document.getElementById('imagePreview');
                    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
                    
                    if (imagePreview && imagePreviewContainer) {
                        imagePreview.src = e.target.result;
                        imagePreviewContainer.style.display = 'block';
                        console.log("이미지 미리보기 표시됨");
                    }
                };
                reader.readAsDataURL(file);
            }
        };
    }
    
    if (cancelImageBtn) {
        cancelImageBtn.onclick = () => {
            console.log("이미지 취소 버튼 클릭됨");
            const imagePreviewContainer = document.getElementById('imagePreviewContainer');
            if (imagePreviewContainer) {
                imagePreviewContainer.style.display = 'none';
            }
            if (imageFileInput) {
                imageFileInput.value = '';
            }
        };
    }
    
    if (saveProfileBtn) {
        console.log("저장 버튼 발견! 이벤트 리스너 등록 중...");
        
        const newSaveBtn = saveProfileBtn.cloneNode(true);
        saveProfileBtn.parentNode.replaceChild(newSaveBtn, saveProfileBtn);
        
        newSaveBtn.addEventListener('click', async function(e) {
            console.log("🔥 저장 버튼 클릭 이벤트 발생!");
            e.preventDefault();
            e.stopPropagation();
            
            newSaveBtn.disabled = true;
            newSaveBtn.textContent = '저장 중...';
            
            try {
                await saveProfile();
            } catch (error) {
                console.error("프로필 저장 중 오류:", error);
                alert('프로필 저장에 실패했습니다. 다시 시도해주세요.');
            } finally {
                newSaveBtn.disabled = false;
                newSaveBtn.textContent = '저장';
            }
        });
        
        console.log("저장 버튼 이벤트 리스너 등록 완료!");
        
    } else {
        console.error("❌ saveProfileBtn 요소를 찾을 수 없습니다!");
    }
    
    console.log("=== 프로필 편집 모달 이벤트 설정 완료 ===");
}

// 프로필 저장 함수
async function saveProfile() {
    console.log("saveProfile 함수 실행 시작");
    
    const user = window.auth.currentUser;
    if (!user) {
        console.error("로그인된 사용자가 없습니다.");
        alert('로그인이 필요합니다.');
        return;
    }
    
    console.log("현재 로그인된 사용자:", user.email);
    
    const newNickname = document.getElementById('newNickname')?.value.trim();
    const imageFileInput = document.getElementById('imageFileInput');
    const selectedFile = imageFileInput?.files[0];
    
    console.log("입력된 데이터:", {
        newNickname: newNickname,
        selectedFile: selectedFile ? selectedFile.name : 'none'
    });
    
    if (!newNickname && !selectedFile) {
        alert('변경할 닉네임을 입력하거나 새 프로필 사진을 선택해주세요.');
        return;
    }
    
    if (newNickname && (newNickname.length < 2 || newNickname.length > 20)) {
        alert('닉네임은 2자 이상 20자 이하로 입력해주세요.');
        return;
    }
    
    try {
        console.log("프로필 저장 프로세스 시작");
        
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) {
            uploadProgress.style.display = 'block';
            console.log("업로드 진행 표시");
        }
        
        let newAvatarUrl = null;
        
        if (selectedFile) {
            console.log("이미지 업로드 시작:", selectedFile.name);
            
            const storage = window.firebase.getStorage();
            const imageRef = window.firebase.ref(storage, `profile_images/${user.uid}/${Date.now()}_${selectedFile.name}`);
            
            try {
                const currentProfile = window.currentUserProfile;
                if (currentProfile?.avatar_url && currentProfile.avatar_url.includes('firebase')) {
                    try {
                        const oldImageRef = window.firebase.ref(storage, currentProfile.avatar_url);
                        await window.firebase.deleteObject(oldImageRef);
                        console.log("기존 이미지 삭제 완료");
                    } catch (deleteError) {
                        console.log('기존 이미지 삭제 실패 (무시):', deleteError);
                    }
                }
                
                const uploadResult = await window.firebase.uploadBytes(imageRef, selectedFile);
                newAvatarUrl = await window.firebase.getDownloadURL(uploadResult.ref);
                console.log('이미지 업로드 성공:', newAvatarUrl);
                
            } catch (uploadError) {
                console.error('이미지 업로드 실패:', uploadError);
                alert('이미지 업로드에 실패했습니다. 다시 시도해주세요.');
                return;
            }
        }
        
        const updateData = {};
        if (newNickname) {
            updateData.nickname = newNickname;
            console.log("닉네임 업데이트 예정:", newNickname);
        }
        if (newAvatarUrl) {
            updateData.avatar_url = newAvatarUrl;
            console.log("아바타 URL 업데이트 예정:", newAvatarUrl);
        }
        
        console.log("Firestore 업데이트 데이터:", updateData);
        
        const profileDocRef = window.firebase.doc(window.db, 'profiles', user.uid);
        await window.firebase.setDoc(profileDocRef, updateData, { merge: true });
        console.log("Firestore 프로필 업데이트 완료");
        
        const authUpdateData = {};
        if (newNickname) {
            authUpdateData.displayName = newNickname;
        }
        if (newAvatarUrl) {
            authUpdateData.photoURL = newAvatarUrl;
        }
        
        if (Object.keys(authUpdateData).length > 0) {
            await window.firebase.updateProfile(user, authUpdateData);
            console.log("Firebase Auth 프로필 업데이트 완료");
        }
        
        const successMessage = document.getElementById('editSuccessMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            console.log("성공 메시지 표시됨");
        }
        
        console.log("사용자 프로필 UI 새로고침 중...");
        if (window.showUserProfile) {
            await window.showUserProfile();
        }
        
        setTimeout(() => {
            const modal = document.getElementById('profileEditModal');
            if (modal) {
                modal.style.display = 'none';
                console.log("프로필 편집 모달 닫힘");
            }
        }, 1500);
        
        console.log("프로필 저장 완료");
        
    } catch (error) {
        console.error('프로필 저장 실패:', error);
        alert('프로필 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
        
        console.log("saveProfile 함수 실행 완료");
    }
}

// 프로필 편집 모달 열기
function openProfileEditModal(profileData) {
    console.log("프로필 편집 모달 열기:", profileData);
    
    const modal = document.getElementById('profileEditModal');
    if (!modal) {
        console.error("프로필 편집 모달을 찾을 수 없습니다!");
        return;
    }
    
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.nickname || 'USER')}&background=667eea&color=fff&size=35&bold=true`;
    
    const currentProfileImage = document.getElementById('currentProfileImage');
    const currentNickname = document.getElementById('currentNickname');
    const currentEmail = document.getElementById('currentEmail');
    const editSuccessMessage = document.getElementById('editSuccessMessage');
    const newNicknameInput = document.getElementById('newNickname');
    
    if (currentProfileImage) {
        currentProfileImage.src = profileData.avatar_url || defaultAvatar;
    }
    
    if (currentNickname) {
        currentNickname.textContent = profileData.nickname;
    }
    
    if (currentEmail) {
        currentEmail.textContent = profileData.email || "";
    }
    
    if (editSuccessMessage) {
        editSuccessMessage.style.display = "none";
    }
    
    if (newNicknameInput) {
        newNicknameInput.value = "";
    }
    
    // 이미지 미리보기 초기화
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    if (imagePreviewContainer) {
        imagePreviewContainer.style.display = 'none';
    }
    
    // 파일 입력 초기화
    const imageFileInput = document.getElementById('imageFileInput');
    if (imageFileInput) {
        imageFileInput.value = '';
    }
    
    modal.style.display = "flex";
    console.log("프로필 편집 모달이 표시됨");
    
    // 모달이 열린 후 이벤트 리스너 재설정
    setTimeout(() => {
        setupProfileEditModalEvents();
    }, 100);
}

// DOMContentLoaded 이벤트에서 초기 이벤트 설정
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded - 프로필 편집 모달 이벤트 설정");
    setupProfileEditModalEvents();
});

// 편집 모달 이벤트 연결
window.addEventListener('DOMContentLoaded', function() {
    const closeEdit = document.getElementById('closeProfileEditModal');
    const cancelEdit = document.getElementById('cancelEditBtn');
    
    if (closeEdit) closeEdit.onclick = () => { 
        document.getElementById('profileEditModal').style.display = "none"; 
    };
    
    if (cancelEdit) cancelEdit.onclick = () => { 
        document.getElementById('profileEditModal').style.display = "none"; 
    };
});

// 전역 함수로 노출
window.openPanel = openPanel;
window.closePanel = closePanel;
window.loadMatchDetails = loadMatchDetails;
window.openProfileEditModal = openProfileEditModal;
window.saveProfile = saveProfile;
window.setupProfileEditModalEvents = setupProfileEditModalEvents;
window.forceUpdatePointsUI = forceUpdatePointsUI;
window.testPointsDisplay = testPointsDisplay;
window.testSaveButton = testSaveButton;