db = db || null;
auth = auth || null;

class AdminController {
    constructor() {
        this.isAdmin = false;
        this.init();
    }

    init() {
        this.checkAdminStatus();
        this.setupEventListeners();
    }

    checkAdminStatus() {
        auth = firebase.getAuth();
        firebase.onAuthStateChanged(auth, async (user) => {
            if (user) {
                db = firebase.getFirestore();
                const adminDocRef = firebase.doc(db, "admins", user.email);
                try {
                    const adminDoc = await firebase.getDoc(adminDocRef);
                    this.isAdmin = adminDoc.exists();
                    document.getElementById('adminAddMatchBtn').style.display = this.isAdmin ? 'block' : 'none';
                } catch (error) {
                    console.error("관리자 권한 확인 실패:", error);
                }
            } else {
                document.getElementById('adminAddMatchBtn').style.display = 'none';
                this.isAdmin = false;
            }
        });
    }

    handleAddMatch() {
        if (typeof openAddMatchModal === "function") {
            openAddMatchModal();
        } else {
            alert('경기 추가 기능 구현 필요!');
        }
        console.log('관리자가 경기 추가 버튼을 클릭했습니다.');
    }

    setupEventListeners() {
        const addMatchBtn = document.getElementById('adminAddMatchBtn');
        if (addMatchBtn) {
            addMatchBtn.onclick = () => this.handleAddMatch();
        }
    }
}

// Firebase 초기화 확인
function initializeMatchAddModal() {
    if (window.firebase && window.firebase.getFirestore && window.firebase.getAuth) {
        db = window.firebase.getFirestore();
        auth = window.firebase.getAuth();
        setupModalEvents();
    } else {
        console.error("Firebase SDK가 아직 로드되지 않았습니다.");
        setTimeout(initializeMatchAddModal, 100); // 100ms 후 재시도
    }
}

// 모달 이벤트 설정
function setupModalEvents() {
    const addMatchModal = document.getElementById('addMatchModal');
    const closeModalBtn = document.getElementById('closeAddMatchModal');
    const cancelBtn = document.getElementById('cancelAddMatch');
    const addMatchForm = document.getElementById('addMatchForm');

    // 모달 닫기 이벤트
    closeModalBtn.onclick = () => addMatchModal.style.display = 'none';
    cancelBtn.onclick = () => addMatchModal.style.display = 'none';
    
    // 모달 배경 클릭시 닫기
    addMatchModal.onclick = (e) => {
        if (e.target === addMatchModal) {
            addMatchModal.style.display = 'none';
        }
    };

    // 팀 이름이 변경될 때 라인업 제목 업데이트
    document.getElementById('homeTeam').oninput = (e) => {
        document.getElementById('homeTeamTitle').textContent = e.target.value || '홈 팀';
    };
    
    document.getElementById('awayTeam').oninput = (e) => {
        document.getElementById('awayTeamTitle').textContent = e.target.value || '원정 팀';
    };

    // 점유율 자동 조정
    document.getElementById('homePossession').oninput = (e) => {
        const homeVal = parseInt(e.target.value) || 0;
        document.getElementById('awayPossession').value = 100 - homeVal;
    };
    
    document.getElementById('awayPossession').oninput = (e) => {
        const awayVal = parseInt(e.target.value) || 0;
        document.getElementById('homePossession').value = 100 - awayVal;
    };

    // 폼 제출 이벤트
    addMatchForm.onsubmit = handleFormSubmit;
}

// 선수 추가 함수
function addPlayer(gradeId) {
    const container = document.getElementById(gradeId);
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'player-input';
    newInput.placeholder = '선수 이름';
    
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.gap = '5px';
    
    inputContainer.appendChild(newInput);
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-player-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => inputContainer.remove();
    
    inputContainer.appendChild(removeBtn);
    container.appendChild(inputContainer);
}

// 라인업 데이터 수집 함수
function getLineupData(teamPrefix) {
    const getPlayersFromGrade = (gradeId) => {
        const inputs = document.querySelectorAll(`#${gradeId} .player-input`);
        return Array.from(inputs)
            .map(input => input.value.trim())
            .filter(name => name.length > 0);
    };

    return {
        third: getPlayersFromGrade(`${teamPrefix}ThirdGrade`),
        second: getPlayersFromGrade(`${teamPrefix}SecondGrade`),
        first: getPlayersFromGrade(`${teamPrefix}FirstGrade`)
    };
}

// 폼 제출 처리
async function handleFormSubmit(e) {
    e.preventDefault();
    
    // 폼 데이터 수집
    const matchData = {
        id: document.getElementById('matchId').value.trim(),
        date: document.getElementById('matchDate').value,
        league: document.getElementById('matchLeague').value.trim(),
        status: document.getElementById('matchStatus').value,
        homeTeam: document.getElementById('homeTeam').value.trim(),
        awayTeam: document.getElementById('awayTeam').value.trim(),
        homeScore: parseInt(document.getElementById('homeScore').value) || 0,
        awayScore: parseInt(document.getElementById('awayScore').value) || 0,
        stats: {
            homePossession: parseInt(document.getElementById('homePossession').value) || 50,
            awayPossession: parseInt(document.getElementById('awayPossession').value) || 50,
            homeShots: parseInt(document.getElementById('homeShots').value) || 0,
            awayShots: parseInt(document.getElementById('awayShots').value) || 0
        },
        lineups: {
            home: getLineupData('home'),
            away: getLineupData('away')
        },
        events: [] 
    };

    // 유효성 검사
    if (!matchData.id || !matchData.date || !matchData.homeTeam || !matchData.awayTeam) {
        alert('필수 정보를 모두 입력해주세요.');
        return;
    }

    try {
        // Firestore에 문서 추가
        const docRef = window.firebase.doc(db, 'matches', matchData.id);
        
        // 문서가 이미 존재하는지 확인
        const docSnap = await window.firebase.getDoc(docRef);
        if (docSnap.exists()) {
            if (!confirm('이미 같은 ID의 경기가 존재합니다. 덮어쓰시겠습니까?')) {
                return;
            }
        }

        // 문서 생성/업데이트
        await window.firebase.setDoc(docRef, matchData);
        
        alert('경기가 성공적으로 추가되었습니다!');
        
        // 폼 초기화
        resetForm();
        
        // 모달 닫기
        document.getElementById('addMatchModal').style.display = 'none';
        
        // 페이지 새로고침 (경기 목록 업데이트)
        if (typeof renderMatches === 'function') {
            renderMatches();
        } else {
            location.reload();
        }
        
    } catch (error) {
        console.error('경기 추가 중 오류 발생:', error);
        alert('경기 추가에 실패했습니다. 다시 시도해주세요.');
    }
}

// 폼 초기화
function resetForm() {
    document.getElementById('addMatchForm').reset();
    
    // 라인업 초기화
    const gradeIds = ['homeThirdGrade', 'homeSecondGrade', 'homeFirstGrade', 
                    'awayThirdGrade', 'awaySecondGrade', 'awayFirstGrade'];
    
    gradeIds.forEach(id => {
        const container = document.getElementById(id);
        container.innerHTML = '<input type="text" class="player-input" placeholder="선수 이름">';
    });
    
    // 팀 제목 초기화
    document.getElementById('homeTeamTitle').textContent = '홈 팀';
    document.getElementById('awayTeamTitle').textContent = '원정 팀';
}

// 경기 추가 모달 열기 (외부에서 호출할 함수)
function openAddMatchModal() {
    const modal = document.getElementById('addMatchModal');
    if (modal) {
        modal.style.display = 'flex';
        // 오늘 날짜를 기본값으로 설정
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('matchDate').value = today;
    }
}

// 페이지 로드시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AdminController();
        initializeMatchAddModal();
    });
} else {
    new AdminController();
    initializeMatchAddModal();
}

// 전역 함수로 노출
window.openAddMatchModal = openAddMatchModal;
window.addPlayer = addPlayer;
