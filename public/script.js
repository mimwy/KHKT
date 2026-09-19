document.addEventListener("DOMContentLoaded", () => {
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    // 1. Chuyển Tab
    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.getAttribute("data-tab");

            navButtons.forEach(btn => btn.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));

            button.classList.add("active");
            const activeTab = document.getElementById(targetTab);
            if (activeTab) {
                activeTab.classList.add("active");
            }
        });
    });

    // 2. Tải thông tin người dùng từ Backend
    function loadUserData() {
       fetch('/api/user', {
    credentials: 'include'
})
.then(async res => {
    console.log("API /api/user status:", res.status);

    if (!res.ok) {
        const error = await res.text();

        console.error("API lỗi:", error);

        // TẠM THỜI KHÔNG chuyển về login
        // window.location.href = '/login';

        return null;
    }

    return res.json();
})
            .then(user => {
                if (!user || user.error) return;

                const sidebarTitle = document.getElementById("sidebar-username-title");
                if (sidebarTitle) sidebarTitle.textContent = user.username;

                const sidebarBtn = document.getElementById("sidebar-username");
                if (sidebarBtn) sidebarBtn.textContent = user.username;

                const displayName = document.getElementById("user-display-name");
                if (displayName) displayName.textContent = user.fullname || user.username;

                const infoUsername = document.getElementById("info-username");
                if (infoUsername) infoUsername.textContent = user.username;

                const infoFullname = document.getElementById("info-fullname");
                if (infoFullname) infoFullname.textContent = user.fullname || "Chưa cập nhật";

                const infoEmail = document.getElementById("info-email");
                if (infoEmail) infoEmail.textContent = user.email || "Chưa cập nhật";

                const infoPhone = document.getElementById("info-phone");
                if (infoPhone) infoPhone.textContent = user.phone || "Chưa cập nhật";
            })
            .catch(err => console.error("Lỗi tải thông tin:", err));
    }

    loadUserData();

    // 3. Xử lý form Edit
    const editForm = document.getElementById("edit-form");
    if (editForm) {
        editForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = {
                fullname: document.getElementById("fullname").value,
                email: document.getElementById("email").value,
                phone: document.getElementById("phone").value
            };

            fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    alert(result.message);
                    loadUserData();
                } else {
                    alert("Cập nhật thất bại!");
                }
            });
        });
    }

    // 4. Xử lý Đổi mật khẩu
    const changePassForm = document.getElementById("change-pass-form");
    if (changePassForm) {
        changePassForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById("old-pass").value;
            const newPassword = document.getElementById("new-pass").value;

            fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword })
            })
            .then(res => res.json())
            .then(result => {
                alert(result.message);
                if (result.success) {
                    changePassForm.reset();
                }
            });
        });
    }

    // 5. Nút Đăng xuất
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            window.location.href = "/logout";
        });
    }
});