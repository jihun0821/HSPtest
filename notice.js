class NoticeManager {
    constructor() {
        this.currentPage = 1;
        this.noticesPerPage = 5;
        this.totalNotices = 0;
        this.notices = [];
        this.isAdmin = false;
        this.init();
    }

    init() {
        this.checkAdminStatus();
        this.loadNotices();
        this.setupEventListeners();
    }

    checkAdminStatus() {
        const auth = firebase.getAuth();
        firebase.onAuthStateChanged(auth, async (user) => {
            if (user) {
                const db = firebase.getFirestore();
                const adminDocRef = firebase.doc(db, "admins", user.email);
                try {
                    const adminDoc = await firebase.getDoc(adminDocRef);
                    this.isAdmin = adminDoc.exists();
                    if (this.isAdmin) {
                        document.getElementById('adminWriteBtn').style.display = 'block';
                    }
                } catch (error) {
                    console.error("관리자 권한 확인 실패:", error);
                }
            }
        });
    }

    setupEventListeners() {
        // 공지사항 작성 모달
        document.getElementById('adminWriteBtn').addEventListener('click', () => {
            document.getElementById('writeNoticeModal').style.display = 'block';
        });

        document.getElementById('closeWriteModal').addEventListener('click', () => {
            document.getElementById('writeNoticeModal').style.display = 'none';
        });

        document.getElementById('cancelWrite').addEventListener('click', () => {
            document.getElementById('writeNoticeModal').style.display = 'none';
        });

        document.getElementById('noticeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitNotice();
        });

        // 상세보기 모달
        document.getElementById('closeDetailModal').addEventListener('click', () => {
            document.getElementById('noticeDetailModal').style.display = 'none';
        });

        document.getElementById('closeDetailBtn').addEventListener('click', () => {
            document.getElementById('noticeDetailModal').style.display = 'none';
        });

        // 모달 외부 클릭 시 닫기
        document.getElementById('noticeDetailModal').addEventListener('click', (e) => {
            if (e.target.id === 'noticeDetailModal') {
                document.getElementById('noticeDetailModal').style.display = 'none';
            }
        });

        // 기타 모달
        document.getElementById('moreLink').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('moreModal').style.display = 'block';
        });

        document.getElementById('closeMoreModal').addEventListener('click', () => {
            document.getElementById('moreModal').style.display = 'none';
        });
    }

    async loadNotices() {
        const db = firebase.getFirestore();
        const noticesRef = firebase.collection(db, "notices");
        const q = firebase.query(noticesRef, firebase.orderBy("timestamp", "desc"));

        try {
            const querySnapshot = await firebase.getDocs(q);
            this.notices = [];
            querySnapshot.forEach(doc => {
                this.notices.push({ id: doc.id, ...doc.data() });
            });

            this.totalNotices = this.notices.length;
            this.renderNotices();
            this.renderPagination();
        } catch (error) {
            console.error("공지사항 불러오기 오류:", error);
            document.getElementById('noticeList').innerHTML = `<p style="color: red;">공지사항을 불러오는 중 오류가 발생했습니다.</p>`;
        }
    }

    renderNotices() {
        const noticeList = document.getElementById('noticeList');
        const startIndex = (this.currentPage - 1) * this.noticesPerPage;
        const endIndex = startIndex + this.noticesPerPage;
        const currentNotices = this.notices.slice(startIndex, endIndex);

        if (currentNotices.length === 0) {
            noticeList.innerHTML = `
                <div class="empty-notice">
                    <div class="empty-notice-icon">📋</div>
                    <div class="empty-notice-text">등록된 공지사항이 없습니다</div>
                    <div class="empty-notice-subtext">새로운 공지사항을 기다려주세요</div>
                </div>
            `;
            return;
        }

        noticeList.innerHTML = currentNotices.map(notice => `
            <div class="notice-item" onclick="noticeManager.openNoticeDetail('${notice.id}')">
                <div class="notice-item-header">
                    <h3 class="notice-item-title">${notice.title}</h3>
                    ${notice.isImportant ? '<span class="notice-badge">중요</span>' : ''}
                </div>
                <div class="notice-content-preview">
                    ${notice.content.length > 100 ? notice.content.substring(0, 100) + '...' : notice.content}
                </div>
                <div class="notice-meta">
                    <span class="notice-author">${notice.author || '관리자'}</span>
                    <span class="notice-date">${notice.date || ''}</span>
                </div>
            </div>
        `).join('');
    }

    renderPagination() {
        const totalPages = Math.ceil(this.totalNotices / this.noticesPerPage);
        const paginationContainer = document.getElementById('noticePagination');

        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let html = `
            <button class="notice-pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="noticeManager.goToPage(${this.currentPage - 1})">
                이전
            </button>
        `;

        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="notice-page-number ${i === this.currentPage ? 'active' : ''}" onclick="noticeManager.goToPage(${i})">
                    ${i}
                </button>
            `;
        }

        html += `
            <button class="notice-pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="noticeManager.goToPage(${this.currentPage + 1})">
                다음
            </button>
            <span class="notice-pagination-info">
                ${this.currentPage} / ${totalPages} 페이지 (총 ${this.totalNotices}개)
            </span>
        `;

        paginationContainer.innerHTML = html;
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.totalNotices / this.noticesPerPage);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderNotices();
        this.renderPagination();
        document.querySelector('.notice-container').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    async submitNotice() {
        const title = document.getElementById('noticeTitle').value.trim();
        const content = document.getElementById('noticeContent').value.trim();
        const isImportant = document.getElementById('isImportant').checked;

        if (!title || !content) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        try {
            const db = firebase.getFirestore();
            const auth = firebase.getAuth();
            const user = auth.currentUser;
            const author = user?.email || "관리자";

            await firebase.addDoc(firebase.collection(db, "notices"), {
                title,
                content,
                isImportant,
                author,
                date: new Date().toISOString().split('T')[0],
                timestamp: firebase.serverTimestamp()
            });

            document.getElementById('noticeForm').reset();
            document.getElementById('writeNoticeModal').style.display = 'none';

            await this.loadNotices();
        } catch (error) {
            console.error('공지사항 저장 오류:', error);
            alert('공지사항 등록 중 오류가 발생했습니다.');
        }
    }

    openNoticeDetail(noticeId) {
        const notice = this.notices.find(n => n.id === noticeId);
        if (!notice) {
            alert('공지사항을 찾을 수 없습니다.');
            return;
        }

        // 모달 내용 채우기
        document.getElementById('detailTitle').textContent = notice.title;
        document.getElementById('detailAuthor').textContent = notice.author || '관리자';
        document.getElementById('detailDate').textContent = notice.date || '';
        document.getElementById('detailContent').textContent = notice.content;

        // 중요 배지 표시/숨김
        const badge = document.getElementById('detailBadge');
        if (notice.isImportant) {
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }

        // 관리자 액션 버튼 추가
        const actionsContainer = document.getElementById('detailActions');
        actionsContainer.innerHTML = `
            <button class="notice-action-btn notice-close-btn" id="closeDetailBtn">닫기</button>
        `;

        if (this.isAdmin) {
            actionsContainer.innerHTML = `
                <button class="notice-action-btn notice-edit-btn" onclick="noticeManager.editNotice('${noticeId}')">수정</button>
                <button class="notice-action-btn notice-delete-btn" onclick="noticeManager.deleteNotice('${noticeId}')">삭제</button>
                <button class="notice-action-btn notice-close-btn" id="closeDetailBtn">닫기</button>
            `;
        }

        // 닫기 버튼 이벤트 재등록
        document.getElementById('closeDetailBtn').addEventListener('click', () => {
            document.getElementById('noticeDetailModal').style.display = 'none';
        });

        // 모달 열기
        document.getElementById('noticeDetailModal').style.display = 'block';
    }

    async deleteNotice(noticeId) {
        if (!confirm('정말로 이 공지사항을 삭제하시겠습니까?')) {
            return;
        }

        try {
            const db = firebase.getFirestore();
            await firebase.deleteDoc(firebase.doc(db, "notices", noticeId));
            
            document.getElementById('noticeDetailModal').style.display = 'none';
            await this.loadNotices();
            
            alert('공지사항이 삭제되었습니다.');
        } catch (error) {
            console.error('공지사항 삭제 오류:', error);
            alert('공지사항 삭제 중 오류가 발생했습니다.');
        }
    }

editNotice(noticeId) {
    if (!this.isAdmin) {
        alert('관리자만 수정할 수 있습니다.');
        return;
    }

    const notice = this.notices.find(n => n.id === noticeId);
    if (!notice) {
        alert('공지사항을 찾을 수 없습니다.');
        return;
    }

    // 작성 모달에 기존 내용 채우기
    document.getElementById('noticeTitle').value = notice.title;
    document.getElementById('noticeContent').value = notice.content;
    document.getElementById('isImportant').checked = notice.isImportant || false;

    // 상세보기 모달 닫기
    document.getElementById('noticeDetailModal').style.display = 'none';
    
    // 작성 모달 열기
    document.getElementById('writeNoticeModal').style.display = 'block';

    // 폼 제출 이벤트를 수정용으로 변경
    const form = document.getElementById('noticeForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await this.updateNotice(noticeId);
    };
}

    async updateNotice(noticeId) {
        const title = document.getElementById('noticeTitle').value.trim();
        const content = document.getElementById('noticeContent').value.trim();
        const isImportant = document.getElementById('isImportant').checked;

        if (!title || !content) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        try {
            const db = firebase.getFirestore();
            const noticeRef = firebase.doc(db, "notices", noticeId);
            
            await firebase.setDoc(noticeRef, {
                title,
                content,
                isImportant,
                date: new Date().toISOString().split('T')[0],
                timestamp: firebase.serverTimestamp()
            }, { merge: true });

            document.getElementById('noticeForm').reset();
            document.getElementById('writeNoticeModal').style.display = 'none';

            // 폼 제출 이벤트를 원래대로 복구
            const form = document.getElementById('noticeForm');
            form.onsubmit = (e) => {
                e.preventDefault();
                this.submitNotice();
            };

            await this.loadNotices();
            alert('공지사항이 수정되었습니다.');
        } catch (error) {
            console.error('공지사항 수정 오류:', error);
            alert('공지사항 수정 중 오류가 발생했습니다.');
        }
    }
}

// 초기화
let noticeManager;
document.addEventListener('DOMContentLoaded', () => {
    noticeManager = new NoticeManager();
});
