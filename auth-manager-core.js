// auth-manager-core.js - 핵심 인증 관리 클래스 (첫 번째 부분)
// auth-config.js가 먼저 로드되어야 합니다.

// 메인 인증 관리 클래스
class AuthManager {
  constructor() {
    this.tempUserData = null;
    this.signupEmail = '';
    this.signupPassword = '';
    this.eventManager = new window.AuthConfig.EventManager();
    this.firebaseManager = new window.AuthConfig.FirebaseManager();
    this.isEmailVerificationPending = false; // 이메일 인증 대기 상태 추가
    this.isInitialized = false;
    
    // DOM이 로드된 후 초기화
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initialize();
      });
    } else {
      this.initialize();
    }
  }

  async initialize() {
    try {
      await this.firebaseManager.initialize();
      this.setupEventListeners();
      this.setupAuthStateListener();
      this.isInitialized = true;
      console.log('AuthManager 초기화 완료');
    } catch (error) {
      console.error('AuthManager 초기화 실패:', error);
    }
  }

  async getUserPoints(uid) {
    try {
      console.log("AuthManager.getUserPoints - 포인트 조회 시작 - UID:", uid);
      
      const firebase = this.firebaseManager.getFirebase();
      const db = this.firebaseManager.getDb();
      
      const pointsDocRef = firebase.doc(db, "user_points", uid);
      const pointsDoc = await firebase.getDoc(pointsDocRef);
      
      if (pointsDoc.exists()) {
        const points = pointsDoc.data().points || 0;
        console.log("AuthManager.getUserPoints - Firestore에서 조회된 포인트:", points);
        return points;
      } else {
        console.log("AuthManager.getUserPoints - 포인트 문서가 존재하지 않음, 0으로 초기화");
        await firebase.setDoc(pointsDocRef, { points: 0, uid: uid });
        return 0;
      }
    } catch (error) {
      console.error("AuthManager.getUserPoints - 포인트 조회 실패:", error);
      return 0;
    }
  }

  /**
   * ✅ 수정된 인증 상태 변화 리스너 - 이메일 인증 대기 중 로그아웃 방지
   */
  setupAuthStateListener() {
    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();
    
    if (!firebase || !auth) {
      console.error('Firebase가 초기화되지 않음');
      return;
    }

    firebase.onAuthStateChanged(auth, async (user) => {
      console.log('Auth 상태 변경:', user ? user.email : 'null');

      if (user) {
        try {
          // 사용자 정보 새로고침
          await user.reload();
          const refreshedUser = auth.currentUser;

          // 이메일 인증 확인
          if (!refreshedUser.emailVerified) {
            console.log('이메일 미인증 상태 감지');
            
            // ✅ 이메일 인증 대기 상태인 경우: UI만 로그아웃 상태로 표시하고 사용자 세션은 유지
            if (this.isEmailVerificationPending) {
              console.log('이메일 인증 대기 중 - 사용자 세션 유지, UI만 로그아웃 상태로 표시');
              this.updateUIForAuthState(false);
              return; // 로그아웃하지 않고 리턴
            }
            
            // ✅ 이메일 인증 대기 상태가 아닌 경우에만 로그아웃
            console.log('이메일 인증 대기 상태가 아니므로 자동 로그아웃');
            await firebase.signOut(auth);
            return;
          }

          // ✅ 이메일 인증이 완료된 경우
          console.log('이메일 인증 완료 - 프로필 표시');
          this.isEmailVerificationPending = false;
          await this.showUserProfile();
          
        } catch (error) {
          console.error('Auth 상태 변경 처리 중 오류:', error);
        }
      } else {
        // ✅ 로그아웃 상태
        console.log('로그아웃 상태');
        
        // 이메일 인증 대기 상태가 아닌 경우에만 상태 초기화
        if (!this.isEmailVerificationPending) {
          this.updateUIForAuthState(false);
        }
      }
    });
  }

  setupEventListeners() {
    this.setupModalEventListeners();
    this.setupFormEventListeners();
    window.AuthConfig.UIHelper.setupProfileImagePreview();
  }

  setupModalEventListeners() {
    // 로그인 모달
    this.eventManager.addListener(
      document.getElementById('loginBtn'),
      'click',
      () => window.AuthConfig.Utils.showModal('loginModal')
    );

    this.eventManager.addListener(
      document.getElementById('closeLoginModal'),
      'click',
      () => window.AuthConfig.Utils.closeModal('loginModal')
    );

    // 회원가입 모달
    this.eventManager.addListener(
      document.getElementById('openSignupLink'),
      'click',
      (e) => {
        e.preventDefault();
        window.AuthConfig.Utils.closeModal('loginModal');
        window.AuthConfig.Utils.showModal('signupModal');
      }
    );

    this.eventManager.addListener(
      document.getElementById('closeSignupModal'),
      'click',
      () => {
        window.AuthConfig.Utils.closeModal('signupModal');
        this.cleanup(); // ✅ 회원가입 모달 닫을 때 정리
      }
    );

    this.eventManager.addListener(
      document.getElementById('backToLoginLink'),
      'click',
      (e) => {
        e.preventDefault();
        window.AuthConfig.Utils.closeModal('signupModal');
        window.AuthConfig.Utils.showModal('loginModal');
        this.cleanup(); // ✅ 로그인으로 돌아갈 때 정리
      }
    );

    // 프로필 모달
    this.eventManager.addListener(
      document.getElementById('openProfileModalBtn'),
      'click',
      () => this.handleOpenProfileModal()
    );

    this.eventManager.addListener(
      document.getElementById('closeProfileModal'),
      'click',
      () => this.handleCloseProfileModal()
    );

    // 비밀번호 재설정 모달
    this.eventManager.addListener(
      document.getElementById('openPasswordResetLink'),
      'click',
      (e) => {
        e.preventDefault();
        window.AuthConfig.Utils.closeModal('loginModal');
        window.AuthConfig.Utils.showModal('passwordResetModal');
      }
    );

    this.eventManager.addListener(
      document.getElementById('closePasswordResetModal'),
      'click',
      () => window.AuthConfig.Utils.closeModal('passwordResetModal')
    );

    this.eventManager.addListener(
      document.getElementById('backToLoginFromReset'),
      'click',
      (e) => {
        e.preventDefault();
        window.AuthConfig.Utils.closeModal('passwordResetModal');
        window.AuthConfig.Utils.showModal('loginModal');
        window.AuthConfig.Utils.clearForm('passwordResetForm');
      }
    );

    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', (e) => {
      const modals = ['loginModal', 'signupModal', 'profileModal', 'passwordResetModal'];
      modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (e.target === modal) {
          window.AuthConfig.Utils.closeModal(modalId);
          if (modalId === 'profileModal' || modalId === 'signupModal') {
            this.cleanup(); // ✅ 모달 외부 클릭시에도 정리
          }
        }
      });
    });
  }

  setupFormEventListeners() {
    // 로그인 폼
    this.eventManager.addListener(
      document.getElementById('doLogin'),
      'click',
      () => this.handleLogin()
    );

    // 회원가입 폼
    this.eventManager.addListener(
      document.getElementById('signupSaveProfileBtn'),
      'click',
      () => this.handleSaveProfile()
    );

    this.eventManager.addListener(
      document.getElementById('checkVerificationBtn'),
      'click',
      () => this.handleCompleteSignup()
    );

    // 비밀번호 재설정
    this.eventManager.addListener(
      document.getElementById('sendResetEmailBtn'),
      'click',
      () => this.handleSendPasswordReset()
    );

    // 닉네임 변경
    this.eventManager.addListener(
      document.getElementById('saveNicknameBtn'),
      'click',
      () => this.handleSaveNickname()
    );

    // 로그아웃
    this.eventManager.addListener(
      document.getElementById('logoutBtn'),
      'click',
      () => this.handleLogout()
    );

    // Enter 키 이벤트
    this.setupEnterKeyEvents();
  }

  setupEnterKeyEvents() {
    const inputs = [
      { id: 'loginPassword', handler: () => this.handleLogin() },
      { id: 'resetEmail', handler: () => this.handleSendPasswordReset() }
    ];

    inputs.forEach(({ id, handler }) => {
      const input = document.getElementById(id);
      if (input) {
        this.eventManager.addListener(input, 'keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handler();
          }
        });
      }
    });
  }

  handleOpenProfileModal() {
    this.signupEmail = document.getElementById('signupEmail')?.value.trim() || '';
    this.signupPassword = document.getElementById('signupPassword')?.value.trim() || '';

    if (!this.signupEmail || !this.signupPassword) {
      alert(window.AuthConfig.ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED);
      return;
    }

    window.AuthConfig.Utils.closeModal('signupModal');
    this.showProfileModal();
  }

  handleCloseProfileModal() {
    window.AuthConfig.Utils.closeModal('profileModal');
    this.cleanup();
  }

  showProfileModal() {
    window.AuthConfig.Utils.closeAllModals();
    window.AuthConfig.Utils.showModal('profileModal');
    
    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) nicknameInput.value = '';
    
    // ✅ 프로필 모달 UI를 초기 상태로 리셋
    window.AuthConfig.UIHelper.resetProfileModalUI();
  }
}