// auth-manager-handlers.js - 이벤트 핸들러 및 유틸리티 메서드 (두 번째 부분)
// auth-manager-core.js가 먼저 로드되어야 합니다.

// AuthManager 클래스에 추가 메서드들 확장
Object.assign(AuthManager.prototype, {
  
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
      alert(window.AuthConfig.ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED);
      return;
    }

    const loginBtn = document.getElementById('doLogin');
    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();
    
    try {
      window.AuthConfig.LoadingManager.showLoading(loginBtn, window.AuthConfig.LOADING_MESSAGES.LOGGING_IN);
      
      const userCredential = await firebase.signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // ✅ 이메일 인증 확인
      if (!user.emailVerified) {
        console.log('로그인 시도했지만 이메일 미인증 상태');
        alert(window.AuthConfig.ERROR_MESSAGES.EMAIL_VERIFICATION_REQUIRED);
        
        // ✅ 이메일 미인증 사용자는 즉시 로그아웃
        await firebase.signOut(auth);
        return;
      }

      console.log('로그인 성공:', user);
      window.AuthConfig.Utils.closeModal('loginModal');
      window.AuthConfig.Utils.clearForm('loginForm'); // 폼 초기화
      
    } catch (error) {
      window.AuthConfig.ErrorHandler.logAndNotify(error, '로그인');
    } finally {
      window.AuthConfig.LoadingManager.hideLoading(loginBtn);
    }
  },

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
      alert(window.AuthConfig.ERROR_MESSAGES.NICKNAME_REQUIRED);
      return;
    }
    
    if (!window.AuthConfig.Validator.validateNickname(nickname)) {
      alert(window.AuthConfig.ERROR_MESSAGES.NICKNAME_LENGTH);
      return;
    }

    if (!window.AuthConfig.Validator.isHanilEmail(this.signupEmail)) {
      alert(window.AuthConfig.ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();

    try {
      window.AuthConfig.LoadingManager.showLoading(saveBtn, window.AuthConfig.LOADING_MESSAGES.CREATING_ACCOUNT);

      // ✅ 계정 생성
      const userCredential = await firebase.createUserWithEmailAndPassword(
        auth, 
        this.signupEmail, 
        this.signupPassword
      );
      const user = userCredential.user;

      console.log('계정 생성 성공:', user);

      // ✅ 임시 데이터 저장
      this.tempUserData = {
        email: this.signupEmail,
        nickname: nickname,
        avatarUrl: window.AuthConfig.Utils.generateAvatarUrl(nickname)
      };

      // ✅ 이메일 인증 대기 상태 설정
      this.isEmailVerificationPending = true;

      // ✅ 이메일 인증 메일 발송
      await firebase.sendEmailVerification(user);
      
      console.log('이메일 인증 메일 발송 완료');
      
      alert('인증 이메일이 발송되었습니다.\n이메일을 확인하고(특히 스팸함) 인증을 완료한 후 "이메일 인증 확인" 버튼을 클릭해주세요.');

      // ✅ UI를 이메일 인증 대기 상태로 변경
      window.AuthConfig.UIHelper.updateUIForEmailVerification(this.signupEmail);

    } catch (error) {
      console.error('계정 생성 중 오류:', error);
      this.isEmailVerificationPending = false; // 실패시 대기 상태 해제
      
      // ✅ 계정 생성 실패시 생성된 사용자 삭제 시도
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await currentUser.delete();
          console.log('실패한 계정 삭제 완료');
        } catch (deleteError) {
          console.error('계정 삭제 실패:', deleteError);
        }
      }
      
      window.AuthConfig.ErrorHandler.logAndNotify(error, '계정 생성');
    } finally {
      window.AuthConfig.LoadingManager.hideLoading(saveBtn);
    }
  },

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
      window.AuthConfig.Utils.closeModal('profileModal');
      return;
    }

    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();
    const db = this.firebaseManager.getDb();

    try {
      window.AuthConfig.LoadingManager.showLoading(checkBtn, '이메일 인증 확인 중...');

      // 2단계: 임시 로그인으로 인증 상태 확인
      console.log('임시 로그인으로 이메일 인증 상태 확인 시작');
      
      let userCredential;
      try {
        userCredential = await firebase.signInWithEmailAndPassword(
          auth, 
          this.signupEmail, 
          this.signupPassword
        );
      } catch (loginError) {
        console.error('임시 로그인 실패:', loginError);
        alert('회원가입 정보를 확인할 수 없습니다. 처음부터 다시 시도해주세요.');
        this.cleanup();
        window.AuthConfig.Utils.closeModal('profileModal');
        return;
      }

      const user = userCredential.user;

      // 3단계: 사용자 정보 새로고침 (가장 최신 상태로)
      await user.reload();
      const refreshedUser = auth.currentUser;

      // 4단계: 이메일 인증 확인
      if (!refreshedUser.emailVerified) {
        // 인증이 아직 완료되지 않은 경우 다시 로그아웃하여 UI 상태 유지
        await firebase.signOut(auth);
        alert(window.AuthConfig.ERROR_MESSAGES.EMAIL_NOT_VERIFIED_YET);
        return;
      }

      console.log('이메일 인증 완료 확인됨 - 회원가입 진행');

      // 5단계: 프로필 정보 저장
      await Promise.all([
        firebase.updateProfile(refreshedUser, {
          displayName: this.tempUserData.nickname,
          photoURL: this.tempUserData.avatarUrl
        }),
        firebase.setDoc(firebase.doc(db, 'profiles', refreshedUser.uid), {
          uid: refreshedUser.uid,
          email: this.tempUserData.email,
          nickname: this.tempUserData.nickname,
          avatar_url: this.tempUserData.avatarUrl,
          created_at: new Date()
        }),
        // 포인트 초기화도 함께 진행
        firebase.setDoc(firebase.doc(db, 'user_points', refreshedUser.uid), {
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
      window.AuthConfig.Utils.closeModal('profileModal');

      // 7단계: 사용자는 이미 로그인된 상태이므로 AuthStateListener가 자동으로 프로필 표시

    } catch (error) {
      console.error('회원가입 완료 처리 중 오류:', error);
      
      // 오류 발생시 로그아웃하여 깔끔한 상태 유지
      try {
        await firebase.signOut(auth);
      } catch (signOutError) {
        console.error('로그아웃 실패:', signOutError);
      }
      
      window.AuthConfig.ErrorHandler.logAndNotify(error, '회원가입 완료');
    } finally {
      window.AuthConfig.LoadingManager.hideLoading(checkBtn);
    }
  },

  async handleSaveNickname() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const newNickname = document.getElementById('newNickname')?.value.trim();
    
    if (!newNickname) {
      alert(window.AuthConfig.ERROR_MESSAGES.NICKNAME_REQUIRED);
      return;
    }
    
    if (!window.AuthConfig.Validator.validateNickname(newNickname)) {
      alert(window.AuthConfig.ERROR_MESSAGES.NICKNAME_LENGTH);
      return;
    }
    
    const auth = this.firebaseManager.getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert(window.AuthConfig.ERROR_MESSAGES.LOGIN_REQUIRED);
      return;
    }
    
    const firebase = this.firebaseManager.getFirebase();
    const db = this.firebaseManager.getDb();
    
    try {
      await Promise.all([
        firebase.setDoc(
          firebase.doc(db, 'profiles', user.uid),
          { nickname: newNickname },
          { merge: true }
        ),
        firebase.updateProfile(user, { displayName: newNickname })
      ]);
      
      const editSuccessMessage = document.getElementById('editSuccessMessage');
      if (editSuccessMessage) {
        editSuccessMessage.style.display = "block";
      }
      
      this.updateUIForAuthState(true);
      
      setTimeout(() => {
        window.AuthConfig.Utils.closeModal('profileEditModal');
      }, 1000);
      
    } catch (error) {
      window.AuthConfig.ErrorHandler.logAndNotify(error, '닉네임 수정');
    }
  },

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
    
    if (!window.AuthConfig.Validator.isHanilEmail(email)) {
      alert(window.AuthConfig.ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();

    try {
      window.AuthConfig.LoadingManager.showLoading(sendBtn, window.AuthConfig.LOADING_MESSAGES.SENDING_EMAIL);
      
      await firebase.sendPasswordResetEmail(auth, email);
      
      alert('비밀번호 재설정 이메일이 전송되었습니다.\n이메일을 확인하고 안내에 따라 비밀번호를 재설정해주세요.');
      
      window.AuthConfig.Utils.closeModal('passwordResetModal');
      window.AuthConfig.Utils.clearForm('passwordResetForm');
      
    } catch (error) {
      window.AuthConfig.ErrorHandler.logAndNotify(error, '비밀번호 재설정 이메일 전송');
    } finally {
      window.AuthConfig.LoadingManager.hideLoading(sendBtn);
    }
  },

  /**
   * ✅ 수정된 로그아웃 처리
   */
  async handleLogout() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const firebase = this.firebaseManager.getFirebase();
    const auth = this.firebaseManager.getAuth();

    try {
      console.log('로그아웃 시작');
      this.cleanup(); // 상태 정리
      await firebase.signOut(auth);
      console.log('로그아웃 완료');
      
    } catch (error) {
      window.AuthConfig.ErrorHandler.logAndNotify(error, '로그아웃');
    }
  },

  /**
   * ✅ 사용자 프로필 표시 (포인트 포함)
   */
  async showUserProfile() {
    if (!this.isInitialized) {
      console.error('AuthManager가 아직 초기화되지 않았습니다.');
      return;
    }

    const auth = this.firebaseManager.getAuth();
    const firebase = this.firebaseManager.getFirebase();
    const db = this.firebaseManager.getDb();

    try {
      const user = auth.currentUser;
      
      if (!user) {
        console.log('사용자 정보 없음');
        this.updateUIForAuthState(false);
        return;
      }

      // ✅ 이메일 인증 재확인 (안전장치)
      if (!user.emailVerified) {
        console.log('프로필 표시 시 이메일 미인증 발견 - 로그아웃 처리');
        await firebase.signOut(auth);
        return;
      }

      console.log('현재 사용자:', user);

      const docRef = firebase.doc(db, 'profiles', user.uid);
      const docSnap = await firebase.getDoc(docRef);

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
          avatar_url: firestoreData.avatar_url || user.photoURL || window.AuthConfig.Utils.generateAvatarUrl(firestoreData.nickname || user.displayName || user.email.split('@')[0], 35)
        };
        console.log('프로필 데이터 (Firestore에서 로드):', profileData);
      } else {
        console.log('프로필 데이터 없음, Firebase Auth 정보 사용');
        const nickname = user.displayName || user.email.split('@')[0];
        profileData = {
          ...profileData,
          nickname: nickname,
          avatar_url: user.photoURL || window.AuthConfig.Utils.generateAvatarUrl(nickname, 35)
        };
        
        // ✅ 프로필 데이터를 Firestore에 저장 (다음번 로그인 시 일관성 유지)
        try {
          await firebase.setDoc(docRef, {
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
      console.log("auth-manager.js - showUserProfile - 포인트 조회 시작");
      const userPoints = await this.getUserPoints(user.uid);
      console.log("auth-manager.js - showUserProfile - 조회된 포인트:", userPoints);
      profileData.points = userPoints;

      // ✅ 전역 변수에도 프로필 데이터 저장
      window.currentUserProfile = profileData;

      window.AuthConfig.Utils.closeAllModals();
      this.updateUIForAuthState(true, profileData);

    } catch (error) {
      console.error('프로필 표시 중 오류:', error);
      this.updateUIForAuthState(false);
    }
  },

  /**
   * 인증 상태에 따른 UI 업데이트
   * @param {boolean} isAuthenticated - 인증 상태
   * @param {Object} profileData - 프로필 데이터
   */
  updateUIForAuthState(isAuthenticated, profileData = null) {
    if (typeof window.updateUIForAuthState === 'function') {
      window.updateUIForAuthState(isAuthenticated, profileData);
    }
  },

  /**
   * ✅ 수정된 임시 데이터 및 상태 초기화
   */
  cleanup() {
    console.log('AuthManager cleanup 실행');
    this.tempUserData = null;
    this.signupEmail = '';
    this.signupPassword = '';
    this.isEmailVerificationPending = false;
    
    // ✅ UI 헬퍼를 통한 폼 정리
    window.AuthConfig.UIHelper.cleanupForms();

    // ✅ 프로필 모달 UI 리셋
    window.AuthConfig.UIHelper.resetProfileModalUI();
  },

  /**
   * 인스턴스 정리
   */
  destroy() {
    this.eventManager.removeAllListeners();
    this.cleanup();
  },

  /**
   * ✅ AuthManager 초기화 완료 여부 확인 메서드
   */
  isReady() {
    return this.isInitialized && this.firebaseManager.isInitialized();
  },

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

});

// ✅ 전역 인스턴스 생성 - 즉시 실행하지 않고 지연 초기화
let authManager = null;

// ✅ AuthManager 인스턴스를 안전하게 생성하는 함수
function createAuthManager() {
  // auth-config.js가 로드되었는지 확인
  if (!window.AuthConfig) {
    console.error('auth-config.js가 먼저 로드되어야 합니다.');
    return null;
  }
  
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