// 설정 및 상수
const CONFIG = {
  EMAIL_DOMAIN: '@hanilgo.cnehs.kr',
  NICKNAME_MIN_LENGTH: 2,
  NICKNAME_MAX_LENGTH: 20,
  AVATAR_BASE_URL: 'https://ui-avatars.com/api/',
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyC_YES_I20XByZpXjCN2p1Vp5gueS4Op24",
    authDomain: "hsp-auth-22845.firebaseapp.com",
    projectId: "hsp-auth-22845",
    storageBucket: "hsp-auth-22845.firebasestorage.app",
    messagingSenderId: "1034282361573",
    appId: "1:1034282361573:web:a15b970a18ae7033552a0c"
  }
};

const ERROR_MESSAGES = {
  INVALID_EMAIL: '한일고 이메일(@hanilgo.cnehs.kr)만 가입할 수 있습니다.',
  NICKNAME_REQUIRED: '닉네임을 입력해주세요.',
  NICKNAME_LENGTH: '닉네임은 2자 이상 20자 이하로 입력해주세요.',
  EMAIL_PASSWORD_REQUIRED: '이메일과 비밀번호를 입력해주세요.',
  LOGIN_REQUIRED: '로그인이 필요합니다.',
  EMAIL_VERIFICATION_REQUIRED: '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.',
  TEMP_DATA_MISSING: '임시 사용자 데이터가 없습니다.',
  PROFILE_IMAGE_NOT_SUPPORTED: '현재 버전에서는 프로필 이미지 업로드가 지원되지 않습니다.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
  EMAIL_NOT_VERIFIED_YET: '이메일 인증이 아직 완료되지 않았습니다.\n메일함에서 인증 링크를 클릭한 후 다시 시도해주세요.'
};

const LOADING_MESSAGES = {
  CREATING_ACCOUNT: '계정 생성 중...',
  SENDING_EMAIL: '이메일 전송 중...',
  LOGGING_IN: '로그인 중...',
  SAVING_PROFILE: '프로필 저장 중...',
  CHECKING_VERIFICATION: '이메일 인증 확인 중...'
};

// 에러 처리 클래스
class ErrorHandler {
  static handleAuthError(error) {
    const errorMessages = {
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
      'auth/weak-password': '비밀번호가 너무 약합니다. 6자 이상 입력해주세요.',
      'auth/invalid-email': '유효하지 않은 이메일 주소입니다.',
      'auth/user-not-found': '존재하지 않는 사용자입니다.',
      'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
      'auth/too-many-requests': '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      'auth/network-request-failed': '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.'
    };
    
    return errorMessages[error.code] || ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  static logAndNotify(error, context) {
    console.error(`${context} 오류:`, error);
    const message = this.handleAuthError(error);
    alert(message);
  }
}

// 유틸리티 클래스
class Utils {
  static closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  }

  static showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
  }

  static clearForm(formId) {
    const form = document.getElementById(formId);
    if (form && typeof form.reset === 'function') {
      // form 요소인 경우
      form.reset();
    } else if (form) {
      // form 요소가 아니지만 요소가 존재하는 경우, 내부의 input들을 수동으로 초기화
      const inputs = form.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') {
          input.checked = false;
        } else {
          input.value = '';
        }
      });
    }
    // form이 null이거나 존재하지 않는 경우는 조용히 무시
  }

  static closeAllModals() {
    const modals = ['loginModal', 'signupModal', 'profileModal', 'passwordResetModal'];
    modals.forEach(modalId => this.closeModal(modalId));
  }

  static generateAvatarUrl(nickname, size = 80) {
    return `${CONFIG.AVATAR_BASE_URL}?name=${encodeURIComponent(nickname)}&background=667eea&color=fff&size=${size}&bold=true`;
  }
}

// 검증 클래스
class Validator {
  static isHanilEmail(email) {
    return email.endsWith(CONFIG.EMAIL_DOMAIN);
  }

  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@hanilgo\.cnehs\.kr$/;
    return emailRegex.test(email);
  }

  static validatePassword(password) {
    return password.length >= 6;
  }

  static validateNickname(nickname) {
    return nickname.length >= CONFIG.NICKNAME_MIN_LENGTH && 
           nickname.length <= CONFIG.NICKNAME_MAX_LENGTH;
  }
}

// 로딩 상태 관리 클래스
class LoadingManager {
  static showLoading(element, text) {
    if (element) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = text;
    }
  }

  static hideLoading(element) {
    if (element) {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  }
}

// 이벤트 관리 클래스
class EventManager {
  constructor() {
    this.listeners = [];
  }

  addListener(element, event, handler) {
    if (element) {
      element.addEventListener(event, handler);
      this.listeners.push({ element, event, handler });
    }
  }

  removeAllListeners() {
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.listeners = [];
  }
}

// 메인 인증 관리 클래스
class AuthManager {
  constructor() {
    this.tempUserData = null;
    this.signupEmail = '';
    this.signupPassword = '';
    this.eventManager = new EventManager();
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
      await this.initializeFirebase();
      this.setupEventListeners();
      this.setupAuthStateListener();
      this.isInitialized = true;
      console.log('AuthManager 초기화 완료');
    } catch (error) {
      console.error('AuthManager 초기화 실패:', error);
    }
  }

  async initializeFirebase() {
    try {
      // Firebase SDK가 로드될 때까지 대기
      let attempts = 0;
      const maxAttempts = 50;
      
      while (!window.firebase && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!window.firebase) {
        throw new Error('Firebase SDK가 로드되지 않았습니다.');
      }

      const { 
        initializeApp, getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
        signOut, onAuthStateChanged, updateProfile, sendEmailVerification,
        getFirestore, doc, setDoc, getDoc, sendPasswordResetEmail
      } = window.firebase;

      this.firebase = {
        initializeApp, getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
        signOut, onAuthStateChanged, updateProfile, sendEmailVerification,
        getFirestore, doc, setDoc, getDoc, sendPasswordResetEmail
      };

      // Firebase 앱이 이미 초기화되어 있는지 확인
      try {
        this.app = window.firebase.getApp();
        console.log('기존 Firebase 앱 사용');
      } catch (error) {
        // 앱이 없으면 새로 초기화
        this.app = this.firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        console.log('새 Firebase 앱 초기화');
      }

      this.auth = this.firebase.getAuth(this.app);
      this.db = this.firebase.getFirestore(this.app);

      console.log('Firebase 초기화 완료');
    } catch (error) {
      console.error('Firebase 초기화 실패:', error);
      throw new Error('Firebase 초기화에 실패했습니다.');
    }
  }

  async getUserPoints(uid) {
    try {
      console.log("AuthManager.getUserPoints - 포인트 조회 시작 - UID:", uid);
      
      const pointsDocRef = this.firebase.doc(this.db, "user_points", uid);
      const pointsDoc = await this.firebase.getDoc(pointsDocRef);
      
      if (pointsDoc.exists()) {
        const points = pointsDoc.data().points || 0;
        console.log("AuthManager.getUserPoints - Firestore에서 조회된 포인트:", points);
        return points;
      } else {
        console.log("AuthManager.getUserPoints - 포인트 문서가 존재하지 않음, 0으로 초기화");
        await this.firebase.setDoc(pointsDocRef, { points: 0, uid: uid });
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
    if (!this.firebase || !this.auth) {
      console.error('Firebase가 초기화되지 않음');
      return;
    }

    this.firebase.onAuthStateChanged(this.auth, async (user) => {
      console.log('Auth 상태 변경:', user ? user.email : 'null');

      if (user) {
        // 사용자 정보 새로고침
        await user.reload();
        const refreshedUser = this.auth.currentUser;

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
          await this.firebase.signOut(this.auth);
          return;
        }

        // ✅ 이메일 인증이 완료된 경우
        console.log('이메일 인증 완료 - 프로필 표시');
        this.isEmailVerificationPending = false;
        await this.showUserProfile();
        
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
    this.setupProfileImagePreview();
  }

  setupModalEventListeners() {
    // 로그인 모달
    this.eventManager.addListener(
      document.getElementById('loginBtn'),
      'click',
      () => Utils.showModal('loginModal')
    );

    this.eventManager.addListener(
      document.getElementById('closeLoginModal'),
      'click',
      () => Utils.closeModal('loginModal')
    );

    // 회원가입 모달
    this.eventManager.addListener(
      document.getElementById('openSignupLink'),
      'click',
      (e) => {
        e.preventDefault();
        Utils.closeModal('loginModal');
        Utils.showModal('signupModal');
      }
    );

    this.eventManager.addListener(
      document.getElementById('closeSignupModal'),
      'click',
      () => {
        Utils.closeModal('signupModal');
        this.cleanup(); // ✅ 회원가입 모달 닫을 때 정리
      }
    );

    this.eventManager.addListener(
      document.getElementById('backToLoginLink'),
      'click',
      (e) => {
        e.preventDefault();
        Utils.closeModal('signupModal');
        Utils.showModal('loginModal');
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
        Utils.closeModal('loginModal');
        Utils.showModal('passwordResetModal');
      }
    );

    this.eventManager.addListener(
      document.getElementById('closePasswordResetModal'),
      'click',
      () => Utils.closeModal('passwordResetModal')
    );

    this.eventManager.addListener(
      document.getElementById('backToLoginFromReset'),
      'click',
      (e) => {
        e.preventDefault();
        Utils.closeModal('passwordResetModal');
        Utils.showModal('loginModal');
        Utils.clearForm('passwordResetForm');
      }
    );

    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', (e) => {
      const modals = ['loginModal', 'signupModal', 'profileModal', 'passwordResetModal'];
      modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (e.target === modal) {
          Utils.closeModal(modalId);
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

  setupProfileImagePreview() {
    const avatarInput = document.getElementById('avatar');
    const fileUploadWrapper = document.querySelector('.file-upload-wrapper');
    
    if (avatarInput) {
      this.eventManager.addListener(avatarInput, 'change', (e) => {
        const file = e.target.files[0];
        if (file) {
          alert(ERROR_MESSAGES.PROFILE_IMAGE_NOT_SUPPORTED);
          e.target.value = '';
        }
      });
    }
    
    if (fileUploadWrapper) {
      fileUploadWrapper.style.display = 'none';
    }
  }

  handleOpenProfileModal() {
    this.signupEmail = document.getElementById('signupEmail')?.value.trim() || '';
    this.signupPassword = document.getElementById('signupPassword')?.value.trim() || '';

    if (!this.signupEmail || !this.signupPassword) {
      alert(ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED);
      return;
    }

    Utils.closeModal('signupModal');
    this.showProfileModal();
  }

  handleCloseProfileModal() {
    Utils.closeModal('profileModal');
    this.cleanup();
  }

  showProfileModal() {
    Utils.closeAllModals();
    Utils.showModal('profileModal');
    
    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) nicknameInput.value = '';
    
    // ✅ 프로필 모달 UI를 초기 상태로 리셋
    this.resetProfileModalUI();
  }

  /**
   * ✅ 로그인 처리 - 이메일 인증 체크 강화
   */
  async handleLogin() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value.trim();

    if (!email || !password) {
      alert(ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED);
      return;
    }

    const loginBtn = document.getElementById('doLogin');
    
    try {
      LoadingManager.showLoading(loginBtn, LOADING_MESSAGES.LOGGING_IN);
      
      const userCredential = await this.firebase.signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // ✅ 이메일 인증 확인
      if (!user.emailVerified) {
        console.log('로그인 시도했지만 이메일 미인증 상태');
        alert(ERROR_MESSAGES.EMAIL_VERIFICATION_REQUIRED);
        
        // ✅ 이메일 미인증 사용자는 즉시 로그아웃
        await this.firebase.signOut(this.auth);
        return;
      }

      console.log('로그인 성공:', user);
      Utils.closeModal('loginModal');
      Utils.clearForm('loginForm'); // 폼 초기화
      
    } catch (error) {
      ErrorHandler.logAndNotify(error, '로그인');
    } finally {
      LoadingManager.hideLoading(loginBtn);
    }
  }

  /**
   * ✅ 수정된 프로필 저장 및 회원가입 처리 - 이메일 인증 강제
   */
  async handleSaveProfile() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const nickname = document.getElementById('nickname')?.value.trim();
    const saveBtn = document.getElementById('signupSaveProfileBtn');
    
    if (!nickname) {
      alert(ERROR_MESSAGES.NICKNAME_REQUIRED);
      return;
    }
    
    if (!Validator.validateNickname(nickname)) {
      alert(ERROR_MESSAGES.NICKNAME_LENGTH);
      return;
    }

    if (!Validator.isHanilEmail(this.signupEmail)) {
      alert(ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    try {
      LoadingManager.showLoading(saveBtn, LOADING_MESSAGES.CREATING_ACCOUNT);

      // ✅ 계정 생성
      const userCredential = await this.firebase.createUserWithEmailAndPassword(
        this.auth, 
        this.signupEmail, 
        this.signupPassword
      );
      const user = userCredential.user;

      console.log('계정 생성 성공:', user);

      // ✅ 임시 데이터 저장
      this.tempUserData = {
        email: this.signupEmail,
        nickname: nickname,
        avatarUrl: Utils.generateAvatarUrl(nickname)
      };

      // ✅ 이메일 인증 대기 상태 설정
      this.isEmailVerificationPending = true;

      // ✅ 이메일 인증 메일 발송
      await this.firebase.sendEmailVerification(user);
      
      console.log('이메일 인증 메일 발송 완료');
      
      alert('인증 이메일이 발송되었습니다.\n이메일을 확인하고(특히 스팸함) 인증을 완료한 후 "이메일 인증 확인" 버튼을 클릭해주세요.');

      // ✅ UI를 이메일 인증 대기 상태로 변경
      this.updateUIForEmailVerification();

    } catch (error) {
      console.error('계정 생성 중 오류:', error);
      this.isEmailVerificationPending = false; // 실패시 대기 상태 해제
      
      // ✅ 계정 생성 실패시 생성된 사용자 삭제 시도
      const currentUser = this.auth.currentUser;
      if (currentUser) {
        try {
          await currentUser.delete();
          console.log('실패한 계정 삭제 완료');
        } catch (deleteError) {
          console.error('계정 삭제 실패:', deleteError);
        }
      }
      
      ErrorHandler.logAndNotify(error, '계정 생성');
    } finally {
      LoadingManager.hideLoading(saveBtn);
    }
  }

  /**
   * ✅ 로그인 없이 이메일 인증 확인이 가능한 회원가입 완료 처리
   */
  async handleCompleteSignup() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const checkBtn = document.getElementById('checkVerificationBtn');
    
    // 1단계: 임시 데이터 확인
    if (!this.tempUserData || !this.signupEmail || !this.signupPassword) {
      alert('회원가입 정보가 없습니다. 처음부터 다시 시도해주세요.');
      this.cleanup();
      Utils.closeModal('profileModal');
      return;
    }

    try {
      LoadingManager.showLoading(checkBtn, '이메일 인증 확인 중...');

      // 2단계: 임시 로그인으로 인증 상태 확인
      console.log('임시 로그인으로 이메일 인증 상태 확인 시작');
      
      let userCredential;
      try {
        userCredential = await this.firebase.signInWithEmailAndPassword(
          this.auth, 
          this.signupEmail, 
          this.signupPassword
        );
      } catch (loginError) {
        console.error('임시 로그인 실패:', loginError);
        alert('회원가입 정보를 확인할 수 없습니다. 처음부터 다시 시도해주세요.');
        this.cleanup();
        Utils.closeModal('profileModal');
        return;
      }

      const user = userCredential.user;

      // 3단계: 사용자 정보 새로고침 (가장 최신 상태로)
      await user.reload();
      const refreshedUser = this.auth.currentUser;

      // 4단계: 이메일 인증 확인
      if (!refreshedUser.emailVerified) {
        // 인증이 아직 완료되지 않은 경우 다시 로그아웃하여 UI 상태 유지
        await this.firebase.signOut(this.auth);
        alert(ERROR_MESSAGES.EMAIL_NOT_VERIFIED_YET);
        return;
      }

      console.log('이메일 인증 완료 확인됨 - 회원가입 진행');

      // 5단계: 프로필 정보 저장
      await Promise.all([
        this.firebase.updateProfile(refreshedUser, {
          displayName: this.tempUserData.nickname,
          photoURL: this.tempUserData.avatarUrl
        }),
        this.firebase.setDoc(this.firebase.doc(this.db, 'profiles', refreshedUser.uid), {
          uid: refreshedUser.uid,
          email: this.tempUserData.email,
          nickname: this.tempUserData.nickname,
          avatar_url: this.tempUserData.avatarUrl,
          created_at: new Date()
        }),
        // 포인트 초기화도 함께 진행
        this.firebase.setDoc(this.firebase.doc(this.db, 'user_points', refreshedUser.uid), {
          points: 0,
          uid: refreshedUser.uid,
          created_at: new Date()
        })
      ]);

      console.log('프로필 정보 저장 완료');

      alert('🎉 회원가입이 완료되었습니다! 환영합니다!');
      
      // 6단계: 상태 정리 및 모달 닫기
      this.isEmailVerificationPending = false;
      this.cleanup();
      Utils.closeModal('profileModal');

      // 7단계: 사용자는 이미 로그인된 상태이므로 AuthStateListener가 자동으로 프로필 표시

    } catch (error) {
      console.error('회원가입 완료 처리 중 오류:', error);
      
      // 오류 발생시 로그아웃하여 깔끔한 상태 유지
      try {
        await this.firebase.signOut(this.auth);
      } catch (signOutError) {
        console.error('로그아웃 실패:', signOutError);
      }
      
      ErrorHandler.logAndNotify(error, '회원가입 완료');
    } finally {
      LoadingManager.hideLoading(checkBtn);
    }
  }

  async handleSaveNickname() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const newNickname = document.getElementById('newNickname')?.value.trim();
    
    if (!newNickname) {
      alert(ERROR_MESSAGES.NICKNAME_REQUIRED);
      return;
    }
    
    if (!Validator.validateNickname(newNickname)) {
      alert(ERROR_MESSAGES.NICKNAME_LENGTH);
      return;
    }
    
    const user = this.auth.currentUser;
    if (!user) {
      alert(ERROR_MESSAGES.LOGIN_REQUIRED);
      return;
    }
    
    try {
      await Promise.all([
        this.firebase.setDoc(
          this.firebase.doc(this.db, 'profiles', user.uid),
          { nickname: newNickname },
          { merge: true }
        ),
        this.firebase.updateProfile(user, { displayName: newNickname })
      ]);
      
      const editSuccessMessage = document.getElementById('editSuccessMessage');
      if (editSuccessMessage) {
        editSuccessMessage.style.display = "block";
      }
      
      this.updateUIForAuthState(true);
      
      setTimeout(() => {
        Utils.closeModal('profileEditModal');
      }, 1000);
      
    } catch (error) {
      ErrorHandler.logAndNotify(error, '닉네임 수정');
    }
  }

  async handleSendPasswordReset() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const email = document.getElementById('resetEmail')?.value.trim();
    const sendBtn = document.getElementById('sendResetEmailBtn');
    
    if (!email) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }
    
    if (!Validator.isHanilEmail(email)) {
      alert(ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    try {
      LoadingManager.showLoading(sendBtn, LOADING_MESSAGES.SENDING_EMAIL);
      
      await this.firebase.sendPasswordResetEmail(this.auth, email);
      
      alert('비밀번호 재설정 이메일이 전송되었습니다.\n이메일을 확인하고 안내에 따라 비밀번호를 재설정해주세요.');
      
      Utils.closeModal('passwordResetModal');
      Utils.clearForm('passwordResetForm');
      
    } catch (error) {
      ErrorHandler.logAndNotify(error, '비밀번호 재설정 이메일 전송');
    } finally {
      LoadingManager.hideLoading(sendBtn);
    }
  }

  /**
   * ✅ 수정된 로그아웃 처리
   */
  async handleLogout() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    try {
      console.log('로그아웃 시작');
      this.cleanup(); // 상태 정리
      await this.firebase.signOut(this.auth);
      console.log('로그아웃 완료');
      
    } catch (error) {
      ErrorHandler.logAndNotify(error, '로그아웃');
    }
  }

  /**
   * ✅ 사용자 프로필 표시 (포인트 포함)
   */
  async showUserProfile() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    try {
      const user = this.auth.currentUser;
      
      if (!user) {
        console.log('사용자 정보 없음');
        this.updateUIForAuthState(false);
        return;
      }

      // ✅ 이메일 인증 재확인 (안전장치)
      if (!user.emailVerified) {
        console.log('프로필 표시 시 이메일 미인증 발견 - 로그아웃 처리');
        await this.firebase.signOut(this.auth);
        return;
      }

      console.log('현재 사용자:', user);

      const docRef = this.firebase.doc(this.db, 'profiles', user.uid);
      const docSnap = await this.firebase.getDoc(docRef);

      let profileData = {
        email: user.email,
        nickname: user.displayName || user.email.split('@')[0],
        avatar_url: user.photoURL
      };
      
      if (docSnap.exists()) {
        const firestoreData = docSnap.data();
        profileData = { 
          ...profileData, 
          ...firestoreData,
          nickname: firestoreData.nickname || user.displayName || user.email.split('@')[0],
          avatar_url: firestoreData.avatar_url || user.photoURL || Utils.generateAvatarUrl(firestoreData.nickname || user.displayName || user.email.split('@')[0], 35)
        };
        console.log('프로필 데이터 (Firestore에서 로드):', profileData);
      } else {
        console.log('프로필 데이터 없음, Firebase Auth 정보 사용');
        const nickname = user.displayName || user.email.split('@')[0];
        profileData = {
          ...profileData,
          nickname: nickname,
          avatar_url: user.photoURL || Utils.generateAvatarUrl(nickname, 35)
        };
        
        // ✅ 프로필 데이터를 Firestore에 저장 (다음번 로그인 시 일관성 유지)
        try {
          await this.firebase.setDoc(docRef, {
            uid: user.uid,
            email: user.email,
            nickname: nickname,
            avatar_url: profileData.avatar_url,
            created_at: new Date()
          });
          console.log('프로필 데이터를 Firestore에 저장했습니다.');
        } catch (saveError) {
          console.warn('프로필 데이터 저장 실패 (무시):', saveError);
        }
      }

      // ✅ 포인트 조회
      console.log("auth.js - showUserProfile - 포인트 조회 시작");
      const userPoints = await this.getUserPoints(user.uid);
      console.log("auth.js - showUserProfile - 조회된 포인트:", userPoints);
      profileData.points = userPoints;

      // ✅ 전역 변수에도 프로필 데이터 저장
      window.currentUserProfile = profileData;

      Utils.closeAllModals();
      this.updateUIForAuthState(true, profileData);

    } catch (error) {
      console.error('프로필 표시 중 오류:', error);
      this.updateUIForAuthState(false);
    }
  }

  /**
   * ✅ 개선된 이메일 인증 대기 상태 UI 업데이트
   */
  updateUIForEmailVerification() {
    const saveBtn = document.getElementById('signupSaveProfileBtn');
    const checkVerificationBtn = document.getElementById('checkVerificationBtn');
    const buttonContainer = saveBtn?.parentElement;
    
    if (saveBtn) {
      saveBtn.style.display = 'none';
    }
    
    if (checkVerificationBtn) {
      checkVerificationBtn.style.display = 'inline-block';
      checkVerificationBtn.disabled = false;
      checkVerificationBtn.textContent = '이메일 인증 확인하기';
      
      if (buttonContainer) {
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.gap = '10px';
      }
    }

    // ✅ 더 상세한 안내 메시지 표시
    const modalContent = document.querySelector('#profileModal .auth-modal-content');
    if (modalContent) {
      let guideMessage = modalContent.querySelector('.email-verification-guide');
      if (!guideMessage) {
        guideMessage = document.createElement('div');
        guideMessage.className = 'email-verification-guide';
        guideMessage.style.cssText = `
          background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
          border: 1px solid #2196f3;
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
          font-size: 14px;
          color: #1976d2;
          line-height: 1.5;
        `;
        guideMessage.innerHTML = `
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 18px; margin-right: 8px;">📧</span>
            <strong style="font-size: 16px;">이메일 인증이 필요합니다</strong>
          </div>
          <div style="font-size: 13px; color: #424242;">
            • <strong>${this.signupEmail}</strong>로 인증 메일을 발송했습니다<br>
            • 메일함(스팸함 포함)에서 인증 링크를 클릭해주세요<br>
            • 인증 완료 후 아래 버튼을 클릭하시면 회원가입이 완료됩니다<br>
          </div>
        `;
        
        const form = modalContent.querySelector('.auth-form');
        if (form) {
          form.insertBefore(guideMessage, form.firstChild);
        }
      }
    }
  }

  /**
   * ✅ 프로필 모달 UI 초기 상태로 리셋
   */
  resetProfileModalUI() {
    const saveBtn = document.getElementById('signupSaveProfileBtn');
    const checkVerificationBtn = document.getElementById('checkVerificationBtn');
    
    if (saveBtn) {
      saveBtn.style.display = 'inline-block';
      saveBtn.disabled = false;
    }
    
    if (checkVerificationBtn) {
      checkVerificationBtn.style.display = 'none';
    }

    // ✅ 이메일 인증 안내 메시지 제거
    const guideMessage = document.querySelector('.email-verification-guide');
    if (guideMessage) {
      guideMessage.remove();
    }
  }

  /**
   * 인증 상태에 따른 UI 업데이트
   * @param {boolean} isAuthenticated - 인증 상태
   * @param {Object} profileData - 프로필 데이터
   */
  updateUIForAuthState(isAuthenticated, profileData = null) {
    if (typeof window.updateUIForAuthState === 'function') {
      window.updateUIForAuthState(isAuthenticated, profileData);
    }
  }

  /**
   * ✅ 수정된 임시 데이터 및 상태 초기화
   */
  cleanup() {
    console.log('AuthManager cleanup 실행');
    this.tempUserData = null;
    this.signupEmail = '';
    this.signupPassword = '';
    this.isEmailVerificationPending = false;
    
    // ✅ 폼 초기화
    const forms = ['signupForm', 'profileForm'];
    forms.forEach(formId => {
      const form = document.getElementById(formId);
      if (form) form.reset();
    });

    // ✅ 회원가입 관련 입력 필드 초기화
    const inputs = ['signupEmail', 'signupPassword', 'nickname'];
    inputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) input.value = '';
    });

    // ✅ 프로필 모달 UI 리셋
    this.resetProfileModalUI();
  }

  /**
   * 인스턴스 정리
   */
  destroy() {
    this.eventManager.removeAllListeners();
    this.cleanup();
  }

  /**
   * ✅ AuthManager 초기화 완료 여부 확인 메서드
   */
  isReady() {
    return this.isInitialized && this.firebase && this.auth && this.db;
  }

  /**
   * ✅ 다른 스크립트에서 AuthManager가 준비될 때까지 대기할 수 있는 메서드
   */
  async waitForReady() {
    let attempts = 0;
    const maxAttempts = 100; // 10초 대기
    
    while (!this.isReady() && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.isReady()) {
      throw new Error('AuthManager 초기화 시간 초과');
    }
    
    return true;
  }
}

// ✅ 전역 인스턴스 생성 - 즉시 실행하지 않고 지연 초기화
let authManager = null;

// ✅ AuthManager 인스턴스를 안전하게 생성하는 함수
function createAuthManager() {
  if (!authManager) {
    authManager = new AuthManager();
  }
  return authManager;
}

// ✅ DOM 로드 완료 후 AuthManager 생성
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createAuthManager();
  });
} else {
  createAuthManager();
}

// ✅ authManager를 전역으로 노출 (다른 스크립트에서 접근 가능)
window.getAuthManager = () => {
  if (!authManager) {
    authManager = createAuthManager();
  }
  return authManager;
};

// ✅ 전역 함수 내보내기 (하위 호환성) - 안전하게 처리
window.logout = () => {
  const manager = window.getAuthManager();
  if (manager && manager.isReady()) {
    return manager.handleLogout();
  } else {
    console.error('AuthManager가 아직 준비되지 않았습니다.');
  }
};

window.showUserProfile = () => {
  const manager = window.getAuthManager();
  if (manager && manager.isReady()) {
    return manager.showUserProfile();
  } else {
    console.error('AuthManager가 아직 준비되지 않았습니다.');
  }
};
