// ===== MAIN SCRIPT (script.js) =====
// 핵심 기능: Firebase 초기화, 인증, 경기 목록, 페이지네이션

// 전역 변수
const matchDetailsPanel = document.getElementById("matchDetailsPanel");
const overlay = document.getElementById("overlay");
const closePanelBtn = document.getElementById("closePanelBtn");
const panelContent = document.getElementById("panelContent");
const panelTitle = document.getElementById("panelTitle");

let currentPage = 6;
const matchesPerPage = 5;
let isAdmin = false;

// Firebase 변수들
let db, auth;

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// Firebase 초기화
function initializeFirebaseGlobals() {
    if (window.firebase && window.firebase.getFirestore && window.firebase.getAuth) {
        db = window.firebase.getFirestore();
        auth = window.firebase.getAuth();
        
        // 전역 변수로 노출
        window.db = db;
        window.auth = auth;
        window.firebase = window.firebase;
        
        console.log("script.js - Firebase 초기화 완료");
        return true;
    }
    return false;
}

// 페이지 타입 감지 함수들
function isLeaderboardPage() {
    const url = window.location.pathname;
    const hasLeaderboardClass = document.querySelector('.leaderboard-section') !== null;
    const hasLeaderboardTitle = document.title && document.title.includes('리더보드');
    
    return url.includes('leaderboard.html') || hasLeaderboardClass || hasLeaderboardTitle;
}

function shouldRenderMatches() {
    const url = window.location.pathname;
    const hasPagination = document.querySelector('.pagination-container') !== null;
    const hasMainSection = document.querySelector('section.main') !== null;
    
    const isMatchPage = (
        url.includes('schedule.html') || 
        url.includes('index.html') || 
        url === '/' || 
        url === ''
    ) && !isLeaderboardPage();
    
    console.log("shouldRenderMatches 체크:", {
        url: url,
        hasPagination: hasPagination,
        hasMainSection: hasMainSection,
        isMatchPage: isMatchPage,
        isLeaderboard: isLeaderboardPage()
    });
    
    return isMatchPage && hasPagination && hasMainSection;
}

// 메인 초기화 함수
window.onload = function () {
    const savedTheme = localStorage.getItem("theme");
    const body = document.body;

    if (savedTheme === "light") {
        body.classList.add("light-mode");
    } else {
        body.classList.remove("light-mode");
    }

    // Firebase 초기화 대기
    const waitForFirebaseInit = () => {
        if (initializeFirebaseGlobals()) {
            checkAdminStatus();
            
            if (shouldRenderMatches()) {
                console.log("경기 목록 페이지 - 경기 렌더링 실행");
                renderMatches();
                updateButtons();
            } else if (isLeaderboardPage()) {
                console.log("리더보드 페이지 - 경기 렌더링 건너뜀");
            } else {
                console.log("기타 페이지 - 경기 클릭 이벤트만 설정");
                setupMatchClickListeners();
            }
        } else {
            console.log("script.js - Firebase SDK 대기 중...");
            setTimeout(waitForFirebaseInit, 100);
        }
    };
    
    waitForFirebaseInit();
    
    checkNoticeVisibility();

    const closeButton = document.querySelector('.close-notice');
    if (closeButton) {
        closeButton.onclick = closeNoticeForWeek;
    }
};

// 관리자 권한 확인
async function checkAdminStatus() {
    if (!auth || !db) {
        console.error("Firebase 변수들이 초기화되지 않았습니다.");
        return;
    }
    
    window.firebase.onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const adminDocRef = window.firebase.doc(db, "admins", user.email);
                const adminDoc = await window.firebase.getDoc(adminDocRef);
                isAdmin = adminDoc.exists();
                
                const adminElements = [
                    'adminResultBtnGroup',
                    'adminAddMatchBtn',
                    'adminWriteBtn'
                ];
                adminElements.forEach(elementId => {
                    const element = document.getElementById(elementId);
                    if (element) {
                        element.style.display = isAdmin ? 'block' : 'none';
                    }
                });
                console.log(`관리자 권한: ${isAdmin ? '있음' : '없음'}`);

            } catch (error) {
                console.error("관리자 권한 확인 실패:", error);
                isAdmin = false;
            }

            await showUserProfile();
            setupPointsListener(user.uid);

        } else {
            isAdmin = false;
            const adminElements = [
                'adminResultBtnGroup',
                'adminAddMatchBtn',
                'adminWriteBtn'
            ];
            adminElements.forEach(elementId => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.style.display = 'none';
                }
            });

            updateUIForAuthState(false);

            if (window.pointsUnsubscribe) {
                window.pointsUnsubscribe();
                window.pointsUnsubscribe = null;
            }
        }
    });
}

// 포인트 관련 함수들
async function getUserPoints(uid) {
    if (window.authManager && window.authManager.getUserPoints) {
        return await window.authManager.getUserPoints(uid);
    }
    
    try {
        console.log("getUserPoints - 포인트 조회 시작 - UID:", uid);
        
        const pointsDocRef = window.firebase.doc(db, "user_points", uid);
        const pointsDoc = await window.firebase.getDoc(pointsDocRef);
        
        if (pointsDoc.exists()) {
            const points = pointsDoc.data().points || 0;
            console.log("getUserPoints - Firestore에서 조회된 포인트:", points);
            return points;
        } else {
            console.log("getUserPoints - 포인트 문서가 존재하지 않음, 0으로 초기화");
            await window.firebase.setDoc(pointsDocRef, { points: 0, uid: uid });
            return 0;
        }
    } catch (error) {
        console.error("getUserPoints - 포인트 조회 실패:", error);
        return 0;
    }
}

async function updateUserPoints(uid, pointsToAdd) {
    try {
        console.log(`포인트 업데이트 시작 - UID: ${uid}, 추가 포인트: ${pointsToAdd}`);
        
        const pointRef = window.firebase.doc(db, "user_points", uid);
        
        const updatedPoints = await window.firebase.runTransaction(async (transaction) => {
            const pointDoc = await transaction.get(pointRef);
            let currentPoints = 0;
            
            if (pointDoc.exists()) {
                currentPoints = pointDoc.data().points || 0;
            }
            
            const newPoints = currentPoints + pointsToAdd;
            
            transaction.set(pointRef, {
                points: newPoints,
                uid: uid,
                lastUpdated: new Date()
            }, { merge: true });
            
            return newPoints;
        });
        
        console.log(`포인트 업데이트 완료 - 새 포인트: ${updatedPoints}`);
        return updatedPoints;
    } catch (error) {
        console.error("포인트 업데이트 실패:", error);
        
        try {
            console.log("트랜잭션 실패, 일반 업데이트로 재시도");
            const pointRef = window.firebase.doc(db, "user_points", uid);
            const pointDoc = await window.firebase.getDoc(pointRef);
            let currentPoints = 0;
            
            if (pointDoc.exists()) {
                currentPoints = pointDoc.data().points || 0;
            }
            
            const newPoints = currentPoints + pointsToAdd;
            
            await window.firebase.setDoc(pointRef, {
                points: newPoints,
                uid: uid,
                lastUpdated: new Date()
            }, { merge: true });
            
            console.log(`일반 업데이트 완료 - 새 포인트: ${newPoints}`);
            return newPoints;
        } catch (fallbackError) {
            console.error("일반 업데이트도 실패:", fallbackError);
            throw fallbackError;
        }
    }
}

function setupPointsListener(uid) {
    console.log("포인트 리스너 설정 - UID:", uid);
    
    if (window.pointsUnsubscribe) {
        window.pointsUnsubscribe();
    }
    
    const pointsDocRef = window.firebase.doc(db, "user_points", uid);
    window.pointsUnsubscribe = window.firebase.onSnapshot(pointsDocRef, (doc) => {
        if (doc.exists()) {
            const newPoints = doc.data().points || 0;
            console.log("실시간 포인트 업데이트:", newPoints);
            
            const pointsElement = document.querySelector('.profile-points');
            if (pointsElement) {
                pointsElement.textContent = `${newPoints}P`;
                console.log("UI 포인트 업데이트 완료:", newPoints);
                
                pointsElement.classList.add('points-updated');
                setTimeout(() => {
                    pointsElement.classList.remove('points-updated');
                }, 1000);
            } else {
                console.error("포인트 표시 요소를 찾을 수 없습니다.");
            }
        } else {
            console.log("포인트 문서가 존재하지 않습니다.");
        }
    }, (error) => {
        console.error("포인트 실시간 감지 오류:", error);
    });
}

// 경기 결과 설정 (관리자용)
async function setMatchResult(matchId, result) {
    const user = auth.currentUser;
    if (!user) {
        alert('로그인 필요');
        return;
    }
    
    const adminDocRef = window.firebase.doc(db, "admins", user.email);
    const adminDoc = await window.firebase.getDoc(adminDocRef);
    if (!adminDoc.exists()) {
        alert("관리자만 결과 설정 가능");
        return;
    }

    try {
        const matchRef = window.firebase.doc(db, "matches", matchId);
        await window.firebase.setDoc(matchRef, {
            status: "finished",
            adminResult: result
        }, { merge: true });

        const votesQuery = window.firebase.query(
          window.firebase.collection(db, "votes"),
          window.firebase.where("matchId", "==", matchId)
        );
        const votesSnapshot = await window.firebase.getDocs(votesQuery);
        const winners = [];
        votesSnapshot.forEach(doc => {
            if (doc.data().voteType === result) {
                winners.push(doc.data().uid);
            }
        });

        console.log("승자 목록:", winners);

        for (const uid of winners) {
            await updateUserPoints(uid, 100);
        }
        
        alert(`${winners.length}명에게 100포인트 지급 완료!`);
        loadMatchDetails(matchId);
        
    } catch (error) {
        console.error("경기 결과 설정 중 오류:", error);
        alert("경기 결과 설정에 실패했습니다.");
    }
}

// 사용자 프로필 표시
async function showUserProfile() {
    if (window.authManager && window.authManager.showUserProfile) {
        return await window.authManager.showUserProfile();
    }
    
    const user = auth.currentUser;
    console.log("showUserProfile 실행 - 사용자:", user?.email);
    
    if (user) {
        try {
            const profileDocRef = window.firebase.doc(db, "profiles", user.uid);
            const profileDoc = await window.firebase.getDoc(profileDocRef);
            
            let profileData = {
                email: user.email,
                nickname: user.displayName || user.email.split('@')[0],
                avatar_url: user.photoURL
            };
            
            if (profileDoc.exists()) {
                profileData = { ...profileData, ...profileDoc.data() };
            }
            
            console.log("showUserProfile - 포인트 조회 시작");
            const userPoints = await getUserPoints(user.uid);
            console.log("showUserProfile - 조회된 포인트:", userPoints);
            profileData.points = userPoints;
            
            window.currentUserProfile = profileData;
            updateUIForAuthState(true, profileData);
            
        } catch (error) {
            console.error("프로필 로드 실패:", error);
            updateUIForAuthState(false);
        }
    } else {
        isAdmin = false;
        window.currentUserProfile = null;
        updateUIForAuthState(false);
        
        if (window.pointsUnsubscribe) {
            window.pointsUnsubscribe();
            window.pointsUnsubscribe = null;
        }
    }
}

// UI 상태 업데이트
function updateUIForAuthState(isLoggedIn, profileData = null) {
    const profileBox = document.getElementById('profile-box');
    
    if (isLoggedIn && profileData) {
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.nickname || 'USER')}&background=667eea&color=fff&size=35&bold=true`;
        const avatarUrl = profileData.avatar_url || defaultAvatar;
        const points = profileData.points || 0;
        
        console.log("updateUIForAuthState - 표시할 포인트:", points);
        
        profileBox.innerHTML = `
            <div class="profile-bar">
                <img id="profileAvatar" src="${avatarUrl}" alt="프로필" class="profile-avatar">
                <div class="profile-info">
                    <span class="profile-nickname">${profileData.nickname || '사용자'}</span>
                    <span class="profile-points">${points}P</span>
                </div>
                <button id="logoutBtn" type="button" class="logout-btn">로그아웃</button>
                <button id="profileSettingsBtn" type="button" title="설정" class="profile-settings-btn">
                    <span class="material-symbols-outlined">&#9881;</span>
                </button>
                <div id="profileSettingsMenu" class="settings-menu">
                    <div class="settings-menu-inner">
                        <div class="settings-menu-title">테마</div>
                        <div class="theme-options">
                            <label class="theme-label">
                                <input type="radio" name="theme" value="system" id="themeSystem">
                                시스템
                            </label>
                            <label class="theme-label">
                                <input type="radio" name="theme" value="light" id="themeLight">
                                라이트
                            </label>
                            <label class="theme-label">
                                <input type="radio" name="theme" value="dark" id="themeDark">
                                다크
                            </label>
                        </div>
                        <hr class="settings-divider">
                        <button id="openProfileEditBtn" class="profile-edit-btn">프로필 편집</button>
                    </div>
                </div>
            </div>
        `;
        
        // 이벤트 리스너들 설정
        document.getElementById('logoutBtn').onclick = logout;
        const settingsBtn = document.getElementById('profileSettingsBtn');
        const settingsMenu = document.getElementById('profileSettingsMenu');
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            settingsMenu.style.display = (settingsMenu.style.display === 'none' || settingsMenu.style.display === '') ? 'block' : 'none';
        };
        
        document.addEventListener('click', function hideMenu(e) {
            if (settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
                settingsMenu.style.display = 'none';
            }
        }, { once: true });
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') document.getElementById('themeLight').checked = true;
        else if (savedTheme === 'dark') document.getElementById('themeDark').checked = true;
        else document.getElementById('themeSystem').checked = true;
        document.getElementById('themeSystem').onclick = () => { setTheme('system'); };
        document.getElementById('themeLight').onclick = () => { setTheme('light'); };
        document.getElementById('themeDark').onclick = () => { setTheme('dark'); };
        
        document.getElementById('openProfileEditBtn').onclick = () => {
            if (window.openProfileEditModal) {
                window.openProfileEditModal(profileData);
            }
            settingsMenu.style.display = 'none';
        };
        
        setTimeout(() => {
            const pointsElement = document.querySelector('.profile-points');
            console.log("updateUIForAuthState - 렌더링된 포인트 요소:", pointsElement ? pointsElement.textContent : '없음');
        }, 50);
        
    } else {
        profileBox.innerHTML = `
            <div class="profile-container">
                <button id="loginBtn" type="button">로그인</button>
                <button id="profileSettingsBtn" type="button" title="설정" class="settings-button">
                    <span class="material-symbols-outlined">⚙</span>
                </button>
                <div id="profileSettingsMenu" class="settings-menu">
                    <div class="settings-content">
                        <div class="settings-title">테마</div>
                        <div class="theme-options">
                            <label class="theme-option">
                                <input type="radio" name="theme" value="system" id="themeSystem">
                                시스템
                            </label>
                            <label class="theme-option">
                                <input type="radio" name="theme" value="light" id="themeLight">
                                라이트
                            </label>
                            <label class="theme-option">
                                <input type="radio" name="theme" value="dark" id="themeDark">
                                다크
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('loginBtn').onclick = () => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.style.display = 'flex';
            } else {
                console.error('loginModal 요소를 찾을 수 없습니다.');
            }
        };
        
        const settingsBtn = document.getElementById('profileSettingsBtn');
        const settingsMenu = document.getElementById('profileSettingsMenu');
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'block' : 'none';
        };
        
        document.addEventListener('click', (e) => {
            if (settingsMenu && !settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsMenu.style.display = 'none';
            }
        });
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') document.getElementById('themeLight').checked = true;
        else if (savedTheme === 'dark') document.getElementById('themeDark').checked = true;
        else document.getElementById('themeSystem').checked = true;
        document.getElementById('themeSystem').onclick = () => { setTheme('system'); };
        document.getElementById('themeLight').onclick = () => { setTheme('light'); };
        document.getElementById('themeDark').onclick = () => { setTheme('dark'); };
    }
}

// 테마 관련 함수들
function setTheme(mode) {
    if (mode === 'system') {
        localStorage.removeItem('theme');
        document.body.classList.remove('light-mode');
        document.body.classList.remove('dark-mode');
    } else if (mode === 'light') {
        localStorage.setItem('theme', 'light');
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    } else if (mode === 'dark') {
        localStorage.setItem('theme', 'dark');
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    }
}

function toggleTheme() {
    document.body.classList.toggle("light-mode");
    localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
}

// 경기 목록 관련 함수들
async function getTotalPages() {
    const allMatches = await getAllMatchData();
    return Math.ceil(Object.keys(allMatches).length / matchesPerPage);
}

async function getAllMatchData() {
    const matchMap = {};
    try {
        const querySnapshot = await window.firebase.getDocs(window.firebase.collection(db, "matches"));
        querySnapshot.forEach((doc) => {
            matchMap[doc.id] = doc.data();
        });
    } catch (error) {
        console.error("경기 목록 불러오기 실패:", error);
    }
    return matchMap;
}

async function renderMatches() {
    if (!shouldRenderMatches()) {
        console.log("renderMatches 실행 건너뜀 - 페이지 조건 불일치");
        return;
    }

    const matchContainer = document.querySelector("section.main");
    if (!matchContainer) {
        console.log("경기 컨테이너가 없음 - renderMatches 실행 건너뜀");
        return;
    }

    console.log("renderMatches 실행 시작");
    const allMatches = Object.values(await getAllMatchData());
    const matchesToShow = allMatches.slice((currentPage - 1) * matchesPerPage, currentPage * matchesPerPage);

    document.querySelectorAll(".match-list").forEach(el => el.remove());
    const pagination = document.querySelector(".pagination-container");

    const html = matchesToShow.map(match => `
        <div class="match-list">
            <div class="match" data-match-id="${match.id}">
                <div class="match-info">
                    <div class="match-date">${match.date}</div>
                    <div class="match-teams">
                        <span class="team home">${match.homeTeam}</span>
                        <span class="score">${match.status === "cancelled" ? "취소" : `${match.homeScore} - ${match.awayScore}`}</span>
                        <span class="team away">${match.awayTeam}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join("");

    if (pagination) {
        pagination.insertAdjacentHTML("beforebegin", html);
    } else {
        matchContainer.innerHTML += html;
    }

    setupMatchClickListeners();
    updateButtons();
    console.log("renderMatches 실행 완료");
}

async function updateButtons() {
    if (!shouldRenderMatches()) {
        return;
    }

    const totalPages = await getTotalPages();
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
    }
}

function setupMatchClickListeners() {
    document.querySelectorAll('.match').forEach(match => {
        match.addEventListener('click', () => {
            const matchId = match.dataset.matchId;
            if (window.openPanel) {
                window.openPanel(matchId);
            }
        });
    });
}

// 페이지네이션 이벤트
if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
        if (!shouldRenderMatches()) return;
        
        if (currentPage > 1) {
            currentPage--;
            await renderMatches();
        }
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
        if (!shouldRenderMatches()) return;
        
        const totalPages = await getTotalPages();
        if (currentPage < totalPages) {
            currentPage++;
            await renderMatches();
        }
    });
}

// 검색 기능
const searchBar = document.querySelector('.search-bar');
if (searchBar) {
    searchBar.addEventListener('input', function (e) {
        const keyword = e.target.value.toLowerCase();
        document.querySelectorAll('section.main .match').forEach(match => {
            match.style.display = match.textContent.toLowerCase().includes(keyword) ? 'block' : 'none';
        });
    });
}

// 공지 관련 함수들
function closeNoticeForWeek() {
    const noticeElement = document.getElementById('topNotice');
    const currentTime = new Date().getTime();
    
    localStorage.setItem('noticeClosed', currentTime);
    
    if (noticeElement) noticeElement.style.display = 'none';
}

function checkNoticeVisibility() {
    const noticeElement = document.getElementById('topNotice');
    const noticeClosed = localStorage.getItem('noticeClosed');
    
    if (noticeElement) {
        if (noticeClosed) {
            const closedTime = parseInt(noticeClosed);
            const currentTime = new Date().getTime();
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            
            if (currentTime - closedTime < oneWeek) {
                noticeElement.style.display = 'none';
            } else {
                localStorage.removeItem('noticeClosed');
                noticeElement.style.display = 'block';
            }
        } else {
            noticeElement.style.display = 'block';
        }
    }
}

// 로그아웃 함수
async function logout() {
    if (window.authManager && window.authManager.handleLogout) {
        return await window.authManager.handleLogout();
    }
    
    try {
        await window.firebase.signOut(auth);
    } catch (error) {
        console.error("로그아웃 실패:", error);
    }
}

// 전역 함수로 노출
window.setMatchResult = setMatchResult;
window.logout = logout;