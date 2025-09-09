// predictions.js - 리더보드 전용
let currentLeaderboardPage = 1;
const usersPerPage = 10;
let allLeaderboardUsers = [];

// Firebase 초기화 대기
window.addEventListener('DOMContentLoaded', () => {
    // script.js에서 Firebase가 초기화될 때까지 대기
    const waitForFirebase = () => {
        if (window.db && window.auth && window.firebase) {
            console.log("predictions.js - Firebase 변수들이 준비됨");
            
            // 인증 상태 변경 감지
            window.firebase.onAuthStateChanged(window.auth, (user) => {
                // 로그인 여부와 관계없이 리더보드 로드
                loadLeaderboard();
            });
            
            // 페이지네이션 버튼 이벤트 리스너
            setupPaginationEvents();
            
        } else {
            console.log("predictions.js - Firebase 변수들 대기 중...", {
                db: !!window.db,
                auth: !!window.auth,
                firebase: !!window.firebase
            });
            setTimeout(waitForFirebase, 100);
        }
    };
    
    waitForFirebase();
});

// 페이지네이션 이벤트 설정
function setupPaginationEvents() {
    const prevBtn = document.getElementById('prevLeaderboardBtn');
    const nextBtn = document.getElementById('nextLeaderboardBtn');
    const retryBtn = document.getElementById('retry-leaderboard');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentLeaderboardPage > 1) {
                currentLeaderboardPage--;
                renderLeaderboardTable();
                updatePaginationButtons();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(allLeaderboardUsers.length / usersPerPage);
            if (currentLeaderboardPage < totalPages) {
                currentLeaderboardPage++;
                renderLeaderboardTable();
                updatePaginationButtons();
            }
        });
    }
    
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            loadLeaderboard();
        });
    }
}

// 리더보드 데이터 로드
async function loadLeaderboard() {
    console.log("리더보드 로드 시작");
    showLoading();
    
    try {
        // script.js에서 선언된 전역 변수 사용
        if (!window.db) {
            console.error("Firebase db가 초기화되지 않았습니다.");
            showError();
            return;
        }
        
        // 1. 모든 사용자 프로필 가져오기
        const profilesSnapshot = await window.firebase.getDocs(window.firebase.collection(window.db, "profiles"));
        const userProfiles = {};
        
        profilesSnapshot.forEach(doc => {
            const data = doc.data();
            userProfiles[doc.id] = {
                uid: doc.id,
                nickname: data.nickname || doc.id,
                email: data.email || '',
                avatar_url: data.avatar_url || null
            };
        });
        
        console.log("사용자 프로필 로드 완료:", Object.keys(userProfiles).length, "명");
        
        // 2. 사용자별 포인트 가져오기
        const pointsSnapshot = await window.firebase.getDocs(window.firebase.collection(window.db, "user_points"));
        const userPoints = {};
        
        pointsSnapshot.forEach(doc => {
            userPoints[doc.id] = doc.data().points || 0;
        });
        
        console.log("포인트 데이터 로드 완료:", Object.keys(userPoints).length, "명");
        
        // 3. 완료된 경기 목록 가져오기 (관리자가 결과를 설정한 경기만)
        const matchesSnapshot = await window.firebase.getDocs(window.firebase.collection(window.db, "matches"));
        const finishedMatches = {};
        
        matchesSnapshot.forEach(doc => {
            const matchData = doc.data();
            if (matchData.status === "finished" && matchData.adminResult) {
                finishedMatches[doc.id] = matchData.adminResult;
            }
        });
        
        console.log("완료된 경기 수:", Object.keys(finishedMatches).length);
        
        // 4. 모든 투표 데이터 가져오기
        const votesSnapshot = await window.firebase.getDocs(window.firebase.collection(window.db, "votes"));
        const userStats = {};
        
        // 사용자별 통계 초기화
        Object.keys(userProfiles).forEach(uid => {
            userStats[uid] = {
                totalVotes: 0,
                correctVotes: 0,
                participatedMatches: new Set() // 참여한 경기 ID 저장 (중복 방지)
            };
        });
        
        // 투표 데이터 처리
        votesSnapshot.forEach(doc => {
            const voteData = doc.data();
            const { uid, matchId, voteType } = voteData;
            
            // 해당 경기가 완료되었고 관리자가 결과를 설정한 경우만 처리
            if (finishedMatches[matchId] && userStats[uid]) {
                userStats[uid].participatedMatches.add(matchId);
                
                // 정답 여부 확인
                if (finishedMatches[matchId] === voteType) {
                    userStats[uid].correctVotes++;
                }
            }
        });
        
        // 참여횟수 계산 (Set을 사용해서 중복 제거된 경기 수)
        Object.keys(userStats).forEach(uid => {
            userStats[uid].totalVotes = userStats[uid].participatedMatches.size;
        });
        
        console.log("투표 통계 계산 완료");
        
        // 5. 최종 리더보드 데이터 생성
        allLeaderboardUsers = Object.keys(userProfiles)
            .map(uid => {
                const profile = userProfiles[uid];
                const stats = userStats[uid];
                const points = userPoints[uid] || 0;
                const accuracy = stats.totalVotes > 0 ? 
                    Math.round((stats.correctVotes / stats.totalVotes) * 100) : 0;
                
                return {
                    uid,
                    nickname: profile.nickname,
                    email: profile.email,
                    avatar_url: profile.avatar_url,
                    points: points,
                    totalVotes: stats.totalVotes,
                    correctVotes: stats.correctVotes,
                    accuracy: accuracy
                };
            })
            .filter(user => user.totalVotes > 0) // 참여한 적이 있는 사용자만 포함
            .sort((a, b) => {
                // 1순위: 포인트 (내림차순)
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                // 2순위: 정확도 (내림차순)
                if (b.accuracy !== a.accuracy) {
                    return b.accuracy - a.accuracy;
                }
                // 3순위: 참여횟수 (내림차순)
                return b.totalVotes - a.totalVotes;
            });
        
        console.log("최종 리더보드 사용자 수:", allLeaderboardUsers.length);
        
        // 리더보드 렌더링
        if (allLeaderboardUsers.length > 0) {
            currentLeaderboardPage = 1;
            renderLeaderboardTable();
            updatePaginationButtons();
            showLeaderboard();
        } else {
            showEmpty();
        }
        
    } catch (error) {
        console.error("리더보드 로드 실패:", error);
        showError();
    }
}

// 리더보드 테이블 렌더링
function renderLeaderboardTable() {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;
    
    const startIndex = (currentLeaderboardPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const pageUsers = allLeaderboardUsers.slice(startIndex, endIndex);
    
    tbody.innerHTML = '';
    
    pageUsers.forEach((user, index) => {
        const globalRank = startIndex + index + 1;
        const row = document.createElement('tr');
        
        // 상위 3위 특별 스타일 적용
        if (globalRank <= 3) {
            row.classList.add('top-rank');
        }
        
        // 프로필 이미지 URL 생성
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nickname)}&background=667eea&color=fff&size=40&bold=true`;
        const avatarUrl = user.avatar_url || defaultAvatar;
        
        // 순위 색상 클래스
        let rankClass = '';
        if (globalRank === 1) rankClass = 'gold';
        else if (globalRank === 2) rankClass = 'silver';
        else if (globalRank === 3) rankClass = 'bronze';
        
        // 정확도에 따른 색상 클래스
        let accuracyClass = '';
        if (user.accuracy >= 70) accuracyClass = 'high';
        else if (user.accuracy >= 50) accuracyClass = 'medium';
        else accuracyClass = 'low';
        
        row.innerHTML = `
            <td>
                <span class="rank-number ${rankClass}">${globalRank}</span>
            </td>
            <td>
                <img src="${avatarUrl}" alt="${user.nickname}" class="profile-avatar" 
                     onerror="this.src='${defaultAvatar}'">
            </td>
            <td>
                <div class="user-nickname">${escapeHtml(user.nickname)}</div>
            </td>
            <td>
                <span class="participation-count">${user.totalVotes}회</span>
            </td>
            <td>
                <span class="accuracy-rate ${accuracyClass}">${user.accuracy}%</span>
            </td>
            <td>
                <span class="user-points">${user.points}P</span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// 페이지네이션 버튼 업데이트
function updatePaginationButtons() {
    const totalPages = Math.ceil(allLeaderboardUsers.length / usersPerPage);
    const prevBtn = document.getElementById('prevLeaderboardBtn');
    const nextBtn = document.getElementById('nextLeaderboardBtn');
    const pageInfo = document.getElementById('leaderboard-page-info');
    
    // null 체크 추가하여 오류 방지
    if (prevBtn) {
        prevBtn.disabled = currentLeaderboardPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentLeaderboardPage >= totalPages;
    }
    
    if (pageInfo) {
        pageInfo.textContent = `${currentLeaderboardPage} / ${Math.max(1, totalPages)}`;
    }
}

// UI 상태 관리 함수들
function showLoading() {
    hideAllContainers();
    const loadingContainer = document.getElementById('leaderboard-loading');
    if (loadingContainer) {
        loadingContainer.style.display = 'block';
    }
}

function showLeaderboard() {
    hideAllContainers();
    const leaderboardContainer = document.getElementById('leaderboard-container');
    if (leaderboardContainer) {
        leaderboardContainer.style.display = 'block';
    }
}

function showError() {
    hideAllContainers();
    const errorContainer = document.getElementById('leaderboard-error');
    if (errorContainer) {
        errorContainer.style.display = 'block';
    }
}

function showEmpty() {
    hideAllContainers();
    const emptyContainer = document.getElementById('leaderboard-empty');
    if (emptyContainer) {
        emptyContainer.style.display = 'block';
    }
}

function hideAllContainers() {
    const containers = [
        'leaderboard-loading',
        'leaderboard-container', 
        'leaderboard-error',
        'leaderboard-empty'
    ];
    
    containers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    });
}

// HTML 이스케이프 함수
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 리더보드 새로고침 함수 (외부에서 호출 가능)
function refreshLeaderboard() {
    console.log("리더보드 새로고침 요청");
    loadLeaderboard();
}

// 전역 함수로 노출
window.refreshLeaderboard = refreshLeaderboard;

// 리더보드 자동 새로고침 (5분마다)
setInterval(() => {
    console.log("자동 리더보드 새로고침");
    loadLeaderboard();
}, 5 * 60 * 1000); // 5분
