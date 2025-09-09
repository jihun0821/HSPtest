// 테마 버튼
const matchDetailsPanel = document.getElementById("matchDetailsPanel");
const overlay = document.getElementById("overlay");
const closePanelBtn = document.getElementById("closePanelBtn");
const panelContent = document.getElementById("panelContent");
const panelTitle = document.getElementById("panelTitle");

let currentPage = 6;
const matchesPerPage = 5;

// 관리자 권한 관련 전역 변수
let isAdmin = false;

async function getTotalPages() {
    const allMatches = await getAllMatchData();
    return Math.ceil(Object.keys(allMatches).length / matchesPerPage);
}

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// ✅ Firebase 변수들을 전역으로 선언하고 초기화
let db, auth;

// ✅ Firebase 초기화를 전역 window 객체에 노출 (predictions.js와 공유)
function initializeFirebaseGlobals() {
    if (window.firebase && window.firebase.getFirestore && window.firebase.getAuth) {
        db = window.firebase.getFirestore();
        auth = window.firebase.getAuth();
        
        // 전역 변수로 노출하여 predictions.js에서 사용 가능하도록 함
        window.db = db;
        window.auth = auth;
        window.firebase = window.firebase; // firebase 객체도 명시적으로 노출
        
        console.log("script.js - Firebase 초기화 완료");
        return true;
    }
    return false;
}

// ✅ 현재 페이지가 리더보드인지 확인하는 함수 수정 - 더 정확하게 감지
function isLeaderboardPage() {
    const url = window.location.pathname;
    const hasLeaderboardClass = document.querySelector('.leaderboard-section') !== null;
    const hasLeaderboardTitle = document.title && document.title.includes('리더보드');
    
    return url.includes('leaderboard.html') || hasLeaderboardClass || hasLeaderboardTitle;
}

// ✅ 현재 페이지에서 경기 목록을 렌더링해야 하는지 확인하는 함수 수정
function shouldRenderMatches() {
    const url = window.location.pathname;
    const hasPagination = document.querySelector('.pagination-container') !== null;
    const hasMainSection = document.querySelector('section.main') !== null;
    
    // schedule.html이거나 index.html이거나 메인 페이지이면서, 리더보드가 아닌 경우
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

window.onload = function () {
    const savedTheme = localStorage.getItem("theme");
    const body = document.body;

    if (savedTheme === "light") {
        body.classList.add("light-mode");
    } else {
        body.classList.remove("light-mode");
    }

    // ✅ Firebase 초기화를 재시도 방식으로 변경
    const waitForFirebaseInit = () => {
        if (initializeFirebaseGlobals()) {
            // Firebase 초기화 성공 시 관리자 권한 확인
            checkAdminStatus();
            
            // ✅ 페이지별로 다른 초기화 실행 - 수정된 로직
            if (shouldRenderMatches()) {
                console.log("경기 목록 페이지 - 경기 렌더링 실행");
                renderMatches();
                updateButtons();
            } else if (isLeaderboardPage()) {
                console.log("리더보드 페이지 - 경기 렌더링 건너뜀");
                // 리더보드는 predictions.js에서 처리하므로 경기 렌더링 안함
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
    
    // 페이지 로드 시 공지 표시 여부 확인
    checkNoticeVisibility();

    // 닫기 버튼에 이벤트 리스너 추가
    const closeButton = document.querySelector('.close-notice');
    if (closeButton) {
        closeButton.onclick = closeNoticeForWeek;
    }

    // 프로필 편집 모달 관련 이벤트 리스너 추가
    setupProfileEditModalEvents();
};

// 관리자 권한 확인 함수 (수정된 버전)
async function checkAdminStatus() {
    // Firebase가 초기화되지 않았으면 에러 반환
    if (!auth || !db) {
        console.error("Firebase 변수들이 초기화되지 않았습니다.");
        return;
    }
    
    window.firebase.onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // ✅ 관리자 권한 확인
                const adminDocRef = window.firebase.doc(db, "admins", user.email);
                const adminDoc = await window.firebase.getDoc(adminDocRef);
                isAdmin = adminDoc.exists();
                
                // 관리자 UI 표시/숨김
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

            // ✅ 로그인 상태 → 프로필 표시 & 포인트 리스너 연결
            await showUserProfile();
            setupPointsListener(user.uid);

        } else {
            // ❌ 로그아웃 상태
            isAdmin = false;

            // 관리자 UI 숨김
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

            // 일반 UI 초기화
            updateUIForAuthState(false);

            // 포인트 리스너 해제
            if (window.pointsUnsubscribe) {
                window.pointsUnsubscribe();
                window.pointsUnsubscribe = null;
            }
        }
    });
}

// ✅ AuthManager의 getUserPoints를 활용하는 전역 함수
async function getUserPoints(uid) {
    // AuthManager 인스턴스가 있으면 그것을 활용, 없으면 직접 조회
    if (window.authManager && window.authManager.getUserPoints) {
        return await window.authManager.getUserPoints(uid);
    }
    
    // Fallback: 직접 조회
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

// updateUserPoints 함수 - firebase 네임스페이스 통일 (트랜잭션 수정)
async function updateUserPoints(uid, pointsToAdd) {
    try {
        console.log(`포인트 업데이트 시작 - UID: ${uid}, 추가 포인트: ${pointsToAdd}`);
        
        const pointRef = window.firebase.doc(db, "user_points", uid);
        
        // 트랜잭션을 사용해서 더 안정적으로 포인트 업데이트
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
        
        // 트랜잭션이 실패하면 일반적인 업데이트 방식으로 재시도
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

// setupPointsListener 함수 - firebase 네임스페이스 통일
function setupPointsListener(uid) {
    console.log("포인트 리스너 설정 - UID:", uid);
    
    // 기존 리스너가 있으면 해제
    if (window.pointsUnsubscribe) {
        window.pointsUnsubscribe();
    }
    
    const pointsDocRef = window.firebase.doc(db, "user_points", uid);
    window.pointsUnsubscribe = window.firebase.onSnapshot(pointsDocRef, (doc) => {
        if (doc.exists()) {
            const newPoints = doc.data().points || 0;
            console.log("실시간 포인트 업데이트:", newPoints);
            
            // UI에서 포인트 표시 부분 업데이트
            const pointsElement = document.querySelector('.profile-points');
            if (pointsElement) {
                pointsElement.textContent = `${newPoints}P`;
                console.log("UI 포인트 업데이트 완료:", newPoints);
                
                // 포인트 변경 애니메이션 효과
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

// setMatchResult 함수 - firebase 네임스페이스 통일
async function setMatchResult(matchId, result) {
    const user = auth.currentUser;
    if (!user) {
        alert('로그인 필요');
        return;
    }
    
    // 관리자 권한 체크
    const adminDocRef = window.firebase.doc(db, "admins", user.email);
    const adminDoc = await window.firebase.getDoc(adminDocRef);
    if (!adminDoc.exists()) {
        alert("관리자만 결과 설정 가능");
        return;
    }

    try {
        // 경기 결과 저장
        const matchRef = window.firebase.doc(db, "matches", matchId);
        await window.firebase.setDoc(matchRef, {
            status: "finished",
            adminResult: result
        }, { merge: true });

        // votes 조회
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

        // 각 winner에게 100포인트씩 지급
        for (const uid of winners) {
            await updateUserPoints(uid, 100);
        }
        
        alert(`${winners.length}명에게 100포인트 지급 완료!`);
        
        // 패널 새로고침으로 결과 반영
        loadMatchDetails(matchId);
        
    } catch (error) {
        console.error("경기 결과 설정 중 오류:", error);
        alert("경기 결과 설정에 실패했습니다.");
    }
}

// 전역 함수로 노출
window.setMatchResult = setMatchResult;

// ✅ showUserProfile 함수 - AuthManager의 showUserProfile 활용
async function showUserProfile() {
    // AuthManager 인스턴스가 있으면 그것을 활용
    if (window.authManager && window.authManager.showUserProfile) {
        return await window.authManager.showUserProfile();
    }
    
    // Fallback: 직접 처리
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
            
            // 포인트 조회
            console.log("showUserProfile - 포인트 조회 시작");
            const userPoints = await getUserPoints(user.uid);
            console.log("showUserProfile - 조회된 포인트:", userPoints);
            profileData.points = userPoints;
            
            // 전역 변수에 프로필 데이터 저장
            window.currentUserProfile = profileData;
            
            // UI 업데이트
            updateUIForAuthState(true, profileData);
            
        } catch (error) {
            console.error("프로필 로드 실패:", error);
            updateUIForAuthState(false);
        }
    } else {
        isAdmin = false;
        window.currentUserProfile = null;
        updateUIForAuthState(false);
        
        // 로그아웃 시 포인트 리스너 해제
        if (window.pointsUnsubscribe) {
            window.pointsUnsubscribe();
            window.pointsUnsubscribe = null;
        }
    }
}

// updateUIForAuthState 함수에서 포인트 표시 부분 확인
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
            openProfileEditModal(profileData);
            settingsMenu.style.display = 'none';
        };
        
        // UI 렌더링 완료 후 포인트 요소 확인
        setTimeout(() => {
            const pointsElement = document.querySelector('.profile-points');
            console.log("updateUIForAuthState - 렌더링된 포인트 요소:", pointsElement ? pointsElement.textContent : '없음');
        }, 50);
        
    } else {
        // 로그아웃 상태 UI
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

// 시스템/라이트/다크 테마 적용 함수
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

function isUserLoggedIn() {
    return !!localStorage.getItem("userEmail");
}

// 프로필 편집 모달 이벤트 설정 (디버깅 강화 버전)
function setupProfileEditModalEvents() {
    console.log("=== 프로필 편집 모달 이벤트 설정 시작 ===");
    
    const closeProfileEditModal = document.getElementById('closeProfileEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const profileEditModal = document.getElementById('profileEditModal');
    const changeImageBtn = document.getElementById('changeImageBtn');
    const imageFileInput = document.getElementById('imageFileInput');
    const cancelImageBtn = document.getElementById('cancelImageBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    
    // 각 요소 존재 확인 및 로그
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
    
    // 이미지 변경 버튼 클릭
    if (changeImageBtn) {
        changeImageBtn.onclick = () => {
            console.log("이미지 변경 버튼 클릭됨");
            if (imageFileInput) {
                imageFileInput.click();
            }
        };
    }
    
    // 파일 선택 시 미리보기 표시
    if (imageFileInput) {
        imageFileInput.onchange = (e) => {
            const file = e.target.files[0];
            console.log("파일 선택됨:", file ? file.name : 'none');
            
            if (file) {
                // 파일 크기 체크 (5MB 제한)
                if (file.size > 5 * 1024 * 1024) {
                    alert('파일 크기가 너무 큽니다. 5MB 이하의 이미지를 선택해주세요.');
                    return;
                }
                
                // 파일 타입 체크
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
    
    // 이미지 취소 버튼
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
    
    // ✅ 프로필 저장 버튼 - 강화된 이벤트 리스너
    if (saveProfileBtn) {
        console.log("저장 버튼 발견! 이벤트 리스너 등록 중...");
        console.log("저장 버튼 요소:", saveProfileBtn);
        console.log("저장 버튼 disabled 상태:", saveProfileBtn.disabled);
        console.log("저장 버튼 style:", saveProfileBtn.style.cssText);
        
        // 기존 모든 이벤트 리스너 제거
        const newSaveBtn = saveProfileBtn.cloneNode(true);
        saveProfileBtn.parentNode.replaceChild(newSaveBtn, saveProfileBtn);
        
        // 새로운 이벤트 리스너 등록
        newSaveBtn.addEventListener('click', async function(e) {
            console.log("🔥 저장 버튼 클릭 이벤트 발생!");
            e.preventDefault();
            e.stopPropagation();
            
            // 버튼 비활성화로 중복 클릭 방지
            newSaveBtn.disabled = true;
            newSaveBtn.textContent = '저장 중...';
            
            try {
                await saveProfile();
            } catch (error) {
                console.error("프로필 저장 중 오류:", error);
                alert('프로필 저장에 실패했습니다. 다시 시도해주세요.');
            } finally {
                // 버튼 상태 복원
                newSaveBtn.disabled = false;
                newSaveBtn.textContent = '저장';
            }
        });
        
        // 추가 이벤트도 테스트
        newSaveBtn.addEventListener('mousedown', function() {
            console.log("저장 버튼 mousedown 이벤트");
        });
        
        newSaveBtn.addEventListener('mouseup', function() {
            console.log("저장 버튼 mouseup 이벤트");
        });
        
        console.log("저장 버튼 이벤트 리스너 등록 완료!");
        
    } else {
        console.error("❌ saveProfileBtn 요소를 찾을 수 없습니다!");
        
        // DOM에서 직접 찾아보기
        const allButtons = document.querySelectorAll('button');
        console.log("페이지의 모든 버튼들:", allButtons);
        
        const possibleSaveBtns = Array.from(allButtons).filter(btn => 
            btn.textContent.includes('저장') || 
            btn.id === 'saveProfileBtn' ||
            btn.className.includes('save')
        );
        console.log("저장 관련 버튼들:", possibleSaveBtns);
    }
    
    console.log("=== 프로필 편집 모달 이벤트 설정 완료 ===");
}

// 간단한 저장 버튼 테스트 함수
function testSaveButton() {
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        console.log("저장 버튼 테스트:");
        console.log("- 요소 존재:", !!saveBtn);
        console.log("- disabled:", saveBtn.disabled);
        console.log("- display:", getComputedStyle(saveBtn).display);
        console.log("- visibility:", getComputedStyle(saveBtn).visibility);
        console.log("- pointer-events:", getComputedStyle(saveBtn).pointerEvents);
        console.log("- z-index:", getComputedStyle(saveBtn).zIndex);
        
        // 강제로 클릭 이벤트 발생
        saveBtn.click();
    } else {
        console.error("저장 버튼을 찾을 수 없습니다!");
    }
}

// 전역 함수로 노출
window.testSaveButton = testSaveButton;

// 프로필 저장 함수 (수정된 버전)
async function saveProfile() {
    console.log("saveProfile 함수 실행 시작");
    
    const user = auth.currentUser;
    if (!user) {
        console.error("로그인된 사용자가 없습니다.");
        alert('로그인이 필요합니다.');
        return;
    }
    
    console.log("현재 로그인된 사용자:", user.email);
    
    const newNickname = document.getElementById('newNickname').value.trim();
    const imageFileInput = document.getElementById('imageFileInput');
    const selectedFile = imageFileInput?.files[0];
    
    console.log("입력된 데이터:", {
        newNickname: newNickname,
        selectedFile: selectedFile ? selectedFile.name : 'none'
    });
    
    // 닉네임과 이미지 모두 없으면 경고
    if (!newNickname && !selectedFile) {
        alert('변경할 닉네임을 입력하거나 새 프로필 사진을 선택해주세요.');
        return;
    }
    
    // 닉네임 길이 체크
    if (newNickname && (newNickname.length < 2 || newNickname.length > 20)) {
        alert('닉네임은 2자 이상 20자 이하로 입력해주세요.');
        return;
    }
    
    try {
        console.log("프로필 저장 프로세스 시작");
        
        // 업로드 진행 표시
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) {
            uploadProgress.style.display = 'block';
            console.log("업로드 진행 표시");
        }
        
        let newAvatarUrl = null;
        
        // 이미지 업로드 처리
        if (selectedFile) {
            console.log("이미지 업로드 시작:", selectedFile.name);
            
            const storage = window.firebase.getStorage();
            const imageRef = window.firebase.ref(storage, `profile_images/${user.uid}/${Date.now()}_${selectedFile.name}`);
            
            try {
                // 기존 이미지 삭제 (선택적)
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
                
                // 새 이미지 업로드
                const uploadResult = await window.firebase.uploadBytes(imageRef, selectedFile);
                newAvatarUrl = await window.firebase.getDownloadURL(uploadResult.ref);
                console.log('이미지 업로드 성공:', newAvatarUrl);
                
            } catch (uploadError) {
                console.error('이미지 업로드 실패:', uploadError);
                alert('이미지 업로드에 실패했습니다. 다시 시도해주세요.');
                return;
            }
        }
        
        // 프로필 데이터 업데이트 준비
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
        
        // Firestore 프로필 문서 업데이트
        const profileDocRef = window.firebase.doc(db, 'profiles', user.uid);
        await window.firebase.setDoc(profileDocRef, updateData, { merge: true });
        console.log("Firestore 프로필 업데이트 완료");
        
        // Firebase Auth 프로필 업데이트
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
        
        // 성공 메시지 표시
        const successMessage = document.getElementById('editSuccessMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            console.log("성공 메시지 표시됨");
        }
        
        // UI 새로고침
        console.log("사용자 프로필 UI 새로고침 중...");
        await showUserProfile();
        
        // 1.5초 후 모달 닫기
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
        // 업로드 진행 표시 숨김
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
        
        console.log("saveProfile 함수 실행 완료");
    }
}

// === 프로필 편집 모달 열기 함수 (수정된 버전) ===
function openProfileEditModal(profileData) {
    console.log("프로필 편집 모달 열기:", profileData);
    
    const modal = document.getElementById('profileEditModal');
    if (!modal) {
        console.error("프로필 편집 모달을 찾을 수 없습니다!");
        return;
    }
    
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.nickname || 'USER')}&background=667eea&color=fff&size=35&bold=true`;
    
    // 현재 정보 표시
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

// === 편집 모달 이벤트 연결 ===
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

// saveVoteToFirestore - firebase 네임스페이스 통일
async function saveVoteToFirestore(matchId, voteType) {
    const user = auth.currentUser;
    if (!user) return;

    // votes 저장 (중복방지)
    const voteRef = window.firebase.doc(db, 'votes', `${matchId}_${user.uid}`);
    const voteSnap = await window.firebase.getDoc(voteRef);

    if (voteSnap.exists()) return null;

    await window.firebase.setDoc(voteRef, {
        matchId,
        uid: user.uid,
        voteType,
        votedAt: new Date()
    });

    // user_points 자동 생성 (없을 경우)
    const pointRef = window.firebase.doc(db, 'user_points', user.uid);
    const pointSnap = await window.firebase.getDoc(pointRef);
    if (!pointSnap.exists()) {
        await window.firebase.setDoc(pointRef, {
            points: 0,
            uid: user.uid
        });
        
        // 새로 생성된 경우 포인트 리스너 다시 설정
        setupPointsListener(user.uid);
    }

    return true;
}

function updatePointsDisplay(newPoints) {
    const pointsElement = document.querySelector('.profile-points');
    if (pointsElement) {
        pointsElement.textContent = `${newPoints}P`;
        
        // 포인트 변경 애니메이션 효과
        pointsElement.classList.add('points-updated');
        setTimeout(() => {
            pointsElement.classList.remove('points-updated');
        }, 1000);
    }
}

async function getVotingStatsFromFirestore(matchId) {
    const stats = { homeWin: 0, draw: 0, awayWin: 0, total: 0 };
    const querySnapshot = await window.firebase.getDocs(
        window.firebase.query(
            window.firebase.collection(db, 'votes'),
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
    const user = auth.currentUser;
    if (!user) return false;

    const voteRef = window.firebase.doc(db, 'votes', `${matchId}_${user.uid}`);
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

function openPanel(matchId) {
    loadMatchDetails(matchId);
    matchDetailsPanel.classList.add("active");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closePanel() {
    matchDetailsPanel.classList.remove("active");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
}

// Firestore에서 단일 경기 정보 가져오기 (비동기)
async function getMatchDetailsById(matchId) {
    try {
        const docRef = window.firebase.doc(db, "matches", matchId);
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

// ✅ teams 컬렉션에서 팀 라인업 가져오기
async function getTeamLineup(teamName) {
    try {
        // teamName을 문서 ID로 사용하여 teams 컬렉션에서 조회
        const teamDocRef = window.firebase.doc(db, "teams", teamName);
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

// ✅ 경기 라인업 데이터 가져오기 (teams 컬렉션 우선)
async function getMatchLineups(matchDetails) {
    try {
        const homeTeamName = matchDetails.homeTeam;
        const awayTeamName = matchDetails.awayTeam;
        
        console.log(`라인업 조회 시작 - 홈팀: ${homeTeamName}, 원정팀: ${awayTeamName}`);
        
        // teams 컬렉션에서 각 팀의 라인업 조회
        const homeLineup = await getTeamLineup(homeTeamName);
        const awayLineup = await getTeamLineup(awayTeamName);
        
        // teams 컬렉션에 라인업이 없으면 matches 컬렉션의 lineups 필드 사용 (폴백)
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
        
        // 오류 발생 시 matches 컬렉션의 lineups 필드 사용 (폴백)
        return matchDetails.lineups || {
            home: { first: [], second: [], third: [] },
            away: { first: [], second: [], third: [] }
        };
    }
}

// loadMatchDetails 함수 (관리자 버튼 포함)
async function loadMatchDetails(matchId) {
    const matchDetails = await getMatchDetailsById(matchId);
    if (!matchDetails) return;
    
    panelTitle.textContent = `${matchDetails.homeTeam} vs ${matchDetails.awayTeam}`;

    const isLoggedIn = !!auth.currentUser;
    const userVoted = isLoggedIn ? await hasUserVoted(matchId) : false;
    const stats = await getVotingStatsFromFirestore(matchId);

    let predictionHtml = "";
    
    // 경기가 finished 상태이고 관리자인 경우 결과 설정 버튼 표시
    if (matchDetails.status === "finished" && isAdmin && !matchDetails.adminResult) {
        predictionHtml = `
            <h3>경기 결과 설정 (관리자)</h3>
            <div class="admin-result-btns">
                <button class="admin-result-btn home-win" onclick="setMatchResult('${matchId}', 'homeWin')">홈팀 승</button>
                <button class="admin-result-btn draw" onclick="setMatchResult('${matchId}', 'draw')">무승부</button>
                <button class="admin-result-btn away-win" onclick="setMatchResult('${matchId}', 'awayWin')">원정팀 승</button>
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

    const statsContainer = panelContent.querySelector('#votingStats');
    if (statsContainer) renderVotingGraph(statsContainer, stats);

    setupPanelTabs(matchId);

    // 일반 사용자 승부예측 버튼 이벤트
    const buttons = panelContent.querySelectorAll('.prediction-btn');
    buttons.forEach(btn => {
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

function setupMatchClickListeners() {
    document.querySelectorAll('.match').forEach(match => {
        match.addEventListener('click', () => {
            const matchId = match.dataset.matchId;
            openPanel(matchId);
        });
    });
}

// Firestore에서 모든 경기 정보 가져오기 (비동기)
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

// ✅ renderMatches 함수 - 수정된 페이지 감지 로직 사용
async function renderMatches() {
    // shouldRenderMatches() 함수로 체크
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

    // 기존 경기 목록 제거
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
    updateButtons(); // 페이지 버튼도 함께 갱신
    console.log("renderMatches 실행 완료");
}

// ✅ updateButtons 함수 - 수정된 페이지 감지 로직 사용
async function updateButtons() {
    // shouldRenderMatches() 함수로 체크
    if (!shouldRenderMatches()) {
        return;
    }

    const totalPages = await getTotalPages();
    
    // null 체크 추가
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
    }
}

// ✅ 페이지네이션 이벤트 - 수정된 페이지 감지 로직 사용
if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
        if (!shouldRenderMatches()) return; // 수정된 조건
        
        if (currentPage > 1) {
            currentPage--;
            await renderMatches();
        }
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
        if (!shouldRenderMatches()) return; // 수정된 조건
        
        const totalPages = await getTotalPages();
        if (currentPage < totalPages) {
            currentPage++;
            await renderMatches();
        }
    });
}

// 검색창 필터링
const searchBar = document.querySelector('.search-bar');
if (searchBar) {
    searchBar.addEventListener('input', function (e) {
        const keyword = e.target.value.toLowerCase();
        document.querySelectorAll('section.main .match').forEach(match => {
            match.style.display = match.textContent.toLowerCase().includes(keyword) ? 'block' : 'none';
        });
    });
}

// 패널 닫기 버튼 및 오버레이 클릭 시 닫힘 처리
if (closePanelBtn) {
    closePanelBtn.addEventListener("click", closePanel);
}
if (overlay) {
    overlay.addEventListener("click", closePanel);
}

// HTML 이스케이프
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

// ✅ renderPanelTabs 함수 수정 - 비동기 처리
async function renderPanelTabs(matchDetails, matchId) {
    // teams 컬렉션에서 라인업 가져오기
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

// ✅ 라인업 렌더링 함수 수정 - lineups 객체를 직접 받도록 변경
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
    return window.firebase.collection(db, 'match_chats', matchId, 'messages');
}

// 패널 탭 동작 및 기능 연결 (수정된 버전)
function setupPanelTabs(matchId) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach((tab, index) => {
        tab.onclick = () => {
            // 모든 탭과 콘텐츠에서 active 클래스 제거
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // 클릭된 탭과 해당 콘텐츠에 active 클래스 추가
            tab.classList.add('active');
            contents[index].classList.add('active');
            
            // 채팅 탭이 활성화된 경우 채팅 기능 초기화
            if (tab.dataset.tab === "chat") {
                setupChat(matchId);
            }
        };
    });
    
    // 기본적으로 첫 번째 탭(라인업)을 활성화
    if (tabs.length > 0 && contents.length > 0) {
        tabs[0].classList.add('active');
        contents[0].classList.add('active');
    }
}

// 채팅 기능 (실시간 반영)
function setupChat(matchId) {
    const chatBox = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const loginNotice = document.querySelector('.chat-login-notice');
    chatBox.innerHTML = "";

    if (!auth.currentUser) {
        loginNotice.style.display = "block";
        chatForm.style.display = "none";
        chatBox.innerHTML = "<p style='text-align:center;color:#aaa;'>로그인 후 채팅을 이용할 수 있습니다.</p>";
        return;
    } else {
        loginNotice.style.display = "none";
        chatForm.style.display = "flex";
    }

    // 기존 setInterval로 불러오는 부분 삭제하고, onSnapshot으로 실시간 반영
    if (window.chatUnsubscribe) window.chatUnsubscribe();

    // Firestore의 onSnapshot 메서드로 실시간 수신
    window.chatUnsubscribe = window.firebase.onSnapshot(
        window.firebase.query(
            chatCollection(matchId),
            window.firebase.where('matchId', '==', matchId)
        ),
        (snapshot) => {
            let html = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.uid === auth.currentUser.uid;
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

    // 메시지 전송
    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        const user = auth.currentUser;
        if (!user) return;
        const profileSnap = await window.firebase.getDoc(window.firebase.doc(db, 'profiles', user.uid));
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

// 공지 닫기 (일주일간)
function closeNoticeForWeek() {
    const noticeElement = document.getElementById('topNotice');
    const currentTime = new Date().getTime();
    
    // 현재 시간을 localStorage에 저장
    localStorage.setItem('noticeClosed', currentTime);
    
    // 공지 숨기기
    if (noticeElement) noticeElement.style.display = 'none';
}

// 페이지 로드 시 공지 표시 여부 확인
function checkNoticeVisibility() {
    const noticeElement = document.getElementById('topNotice');
    const noticeClosed = localStorage.getItem('noticeClosed');
    
    if (noticeElement) {
        if (noticeClosed) {
            const closedTime = parseInt(noticeClosed);
            const currentTime = new Date().getTime();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 일주일을 밀리초로 변환
            
            // 일주일이 지났는지 확인
            if (currentTime - closedTime < oneWeek) {
                // 아직 일주일이 안 지났으면 공지 숨기기
                noticeElement.style.display = 'none';
            } else {
                // 일주일이 지났으면 localStorage에서 제거하고 공지 표시
                localStorage.removeItem('noticeClosed');
                noticeElement.style.display = 'block';
            }
        } else {
            noticeElement.style.display = 'block';
        }
    }
}

// 디버깅을 위한 직접적인 포인트 표시 함수
function forceUpdatePointsUI(points) {
    const pointsElement = document.querySelector('.profile-points');
    if (pointsElement) {
        pointsElement.textContent = `${points}P`;
        console.log("forceUpdatePointsUI - 포인트 강제 업데이트:", points);
        
        // 애니메이션 효과
        pointsElement.classList.add('points-updated');
        setTimeout(() => {
            pointsElement.classList.remove('points-updated');
        }, 1000);
    } else {
        console.error("forceUpdatePointsUI - 포인트 요소를 찾을 수 없습니다.");
    }
}

// 즉시 테스트할 수 있는 함수
async function testPointsDisplay() {
    const user = auth.currentUser;
    if (!user) {
        console.log("로그인된 사용자가 없습니다.");
        return;
    }
    
    console.log("=== 포인트 표시 테스트 시작 ===");
    
    // 1. Firestore에서 포인트 조회
    const points = await getUserPoints(user.uid);
    console.log("테스트 - 조회된 포인트:", points);
    
    // 2. UI에 직접 반영
    forceUpdatePointsUI(points);
    
    console.log("=== 포인트 표시 테스트 완료 ===");
}

// ✅ logout 함수 - AuthManager의 handleLogout 활용
async function logout() {
    if (window.authManager && window.authManager.handleLogout) {
        return await window.authManager.handleLogout();
    }
    
    // Fallback: 직접 처리
    try {
        await window.firebase.signOut(auth);
    } catch (error) {
        console.error("로그아웃 실패:", error);
    }
}

// 전역 함수로 노출
window.openProfileEditModal = openProfileEditModal;
window.saveProfile = saveProfile;
window.setupProfileEditModalEvents = setupProfileEditModalEvents;
window.forceUpdatePointsUI = forceUpdatePointsUI;
window.testPointsDisplay = testPointsDisplay;
window.setMatchResult = setMatchResult;
window.logout = logout;
