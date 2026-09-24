document.addEventListener("DOMContentLoaded", () => {

    // =====================================================
    // 1. CHUYỂN TAB
    // =====================================================

    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    navButtons.forEach(button => {
        button.addEventListener("click", () => {

            const targetTab = button.getAttribute("data-tab");

            navButtons.forEach(btn => {
                btn.classList.remove("active");
            });

            tabContents.forEach(content => {
                content.classList.remove("active");
            });

            button.classList.add("active");

            const activeTab = document.getElementById(targetTab);

            if (activeTab) {
                activeTab.classList.add("active");
            }
        });
    });


    // =====================================================
    // 2. TẢI THÔNG TIN NGƯỜI DÙNG
    // =====================================================

    function loadUserData() {

        fetch("/api/user", {
            credentials: "include"
        })

        .then(async res => {

            console.log("API /api/user status:", res.status);

            if (!res.ok) {

                const error = await res.text();

                console.error("API lỗi:", error);

                return null;
            }

            return res.json();
        })

        .then(user => {

            if (!user || user.error) {
                return;
            }

            const sidebarTitle =
                document.getElementById("sidebar-username-title");

            if (sidebarTitle) {
                sidebarTitle.textContent = user.username;
            }


            const sidebarBtn =
                document.getElementById("sidebar-username");

            if (sidebarBtn) {
                sidebarBtn.textContent = user.username;
            }


            const displayName =
                document.getElementById("user-display-name");

            if (displayName) {
                displayName.textContent =
                    user.fullname || user.username;
            }


            const infoUsername =
                document.getElementById("info-username");

            if (infoUsername) {
                infoUsername.textContent = user.username;
            }


            const infoFullname =
                document.getElementById("info-fullname");

            if (infoFullname) {
                infoFullname.textContent =
                    user.fullname || "Chưa cập nhật";
            }


            const infoEmail =
                document.getElementById("info-email");

            if (infoEmail) {
                infoEmail.textContent =
                    user.email || "Chưa cập nhật";
            }


            const infoPhone =
                document.getElementById("info-phone");

            if (infoPhone) {
                infoPhone.textContent =
                    user.phone || "Chưa cập nhật";
            }

        })

        .catch(err => {
            console.error("Lỗi tải thông tin:", err);
        });
    }


    loadUserData();


    // =====================================================
    // 3. CHỈNH SỬA THÔNG TIN
    // =====================================================

    const editForm = document.getElementById("edit-form");

    if (editForm) {

        editForm.addEventListener("submit", e => {

            e.preventDefault();

            const data = {

                fullname:
                    document.getElementById("fullname").value,

                email:
                    document.getElementById("email").value,

                phone:
                    document.getElementById("phone").value
            };


            fetch("/api/user/update", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify(data)
            })

            .then(res => res.json())

            .then(result => {

                if (result.success) {

                    alert(result.message);

                    loadUserData();

                } else {

                    alert(
                        result.message ||
                        "Cập nhật thất bại!"
                    );
                }

            })

            .catch(err => {

                console.error(
                    "Lỗi cập nhật thông tin:",
                    err
                );

                alert("Có lỗi xảy ra!");
            });
        });
    }


    // =====================================================
    // 4. ĐỔI MẬT KHẨU
    // =====================================================

    const changePassForm =
        document.getElementById("change-pass-form");

    if (changePassForm) {

        changePassForm.addEventListener("submit", e => {

            e.preventDefault();

            const oldPassword =
                document.getElementById("old-pass").value;

            const newPassword =
                document.getElementById("new-pass").value;


            fetch("/api/user/change-password", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify({
                    oldPassword,
                    newPassword
                })
            })

            .then(res => res.json())

            .then(result => {

                alert(result.message);

                if (result.success) {
                    changePassForm.reset();
                }

            })

            .catch(err => {

                console.error(
                    "Lỗi đổi mật khẩu:",
                    err
                );

                alert("Có lỗi xảy ra!");
            });
        });
    }


    // =====================================================
    // 5. ĐĂNG XUẤT
    // =====================================================

    const logoutBtn =
        document.getElementById("logout-btn");

    if (logoutBtn) {

        logoutBtn.addEventListener("click", () => {

            window.location.href = "/logout";

        });
    }


    // =====================================================
    // 6. TẢI DANH SÁCH PROJECT
    // =====================================================

    async function loadProjects() {

        const projectList =
            document.getElementById("project-list");

        const emptyMessage =
            document.getElementById("empty-project-message");


        // Nếu trang hiện tại không có khu vực project
        // thì không làm gì
        if (!projectList) {
            return;
        }


        try {

            const response = await fetch(
                "/api/projects",
                {
                    credentials: "include"
                }
            );


            const result = await response.json();


            if (!response.ok || !result.success) {

                console.error(
                    "Lỗi tải project:",
                    result
                );

                return;
            }


            projectList.innerHTML = "";


            const projects = result.projects || [];


            // Không có project
            if (projects.length === 0) {

                if (emptyMessage) {
                    emptyMessage.style.display = "block";
                }

                return;
            }


            // Có project
            if (emptyMessage) {
                emptyMessage.style.display = "none";
            }


            projects.forEach(project => {

                const projectCard =
                    document.createElement("div");

                projectCard.className = "project-card";


                // Tên project
                const title =
                    document.createElement("h3");

                title.textContent =
                    project.name || "Dự án chưa đặt tên";


                // Thông tin ngày cập nhật
                const date =
                    document.createElement("p");

                date.className = "project-date";


                if (project.updated_at) {

                    const projectDate =
                        new Date(project.updated_at);

                    date.textContent =
                        "Cập nhật: " +
                        projectDate.toLocaleString("vi-VN");
                }


                // Nút mở project
                const openBtn =
                    document.createElement("button");

                openBtn.className =
                    "project-open-btn";

                openBtn.textContent =
                    "Mở bản đồ";


                openBtn.addEventListener("click", () => {

                    window.location.href =
                        `/map.html?id=${project.id}`;

                });


                // Nút xóa project
                const deleteBtn =
                    document.createElement("button");

                deleteBtn.className =
                    "project-delete-btn";

                deleteBtn.textContent =
                    "Xóa";


                deleteBtn.addEventListener(
                    "click",
                    async () => {

                        const confirmed =
                            confirm(
                                `Bạn có chắc muốn xóa "${project.name}" không?`
                            );


                        if (!confirmed) {
                            return;
                        }


                        try {

                            const response =
                                await fetch(
                                    `/api/projects/${project.id}`,
                                    {
                                        method: "DELETE",
                                        credentials: "include"
                                    }
                                );


                            const result =
                                await response.json();


                            if (!response.ok ||
                                !result.success) {

                                alert(
                                    result.message ||
                                    "Không thể xóa dự án!"
                                );

                                return;
                            }


                            alert(
                                "Xóa dự án thành công!"
                            );


                            // Tải lại danh sách
                            loadProjects();

                        } catch (err) {

                            console.error(
                                "Lỗi xóa project:",
                                err
                            );

                            alert(
                                "Có lỗi xảy ra khi xóa dự án!"
                            );
                        }
                    }
                );


                // Khu vực nút
                const buttons =
                    document.createElement("div");

                buttons.className =
                    "project-buttons";

                buttons.appendChild(openBtn);
                buttons.appendChild(deleteBtn);


                projectCard.appendChild(title);
                projectCard.appendChild(date);
                projectCard.appendChild(buttons);


                projectList.appendChild(projectCard);

            });


        } catch (err) {

            console.error(
                "Lỗi tải danh sách project:",
                err
            );
        }
    }


    loadProjects();


    // =====================================================
    // 7. TẠO BẢN ĐỒ MỚI
    // =====================================================

    const createMapBtn =
        document.querySelector(".create-map-btn");


    if (createMapBtn) {

        createMapBtn.addEventListener(
            "click",
            async e => {

                // Ngăn href="map.html" chạy ngay
                e.preventDefault();


                const projectName =
                    prompt(
                        "Nhập tên dự án:",
                        "Bản đồ thư viện mới"
                    );


                // Người dùng bấm Cancel
                if (projectName === null) {
                    return;
                }


                const name =
                    projectName.trim();


                if (!name) {

                    alert(
                        "Tên dự án không được để trống!"
                    );

                    return;
                }


                try {

                    const response =
                        await fetch(
                            "/api/projects",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                credentials: "include",

                                body: JSON.stringify({
                                    name: name,
                                    canvas_data: null
                                })
                            }
                        );


                    const result =
                        await response.json();


                    console.log(
                        "Kết quả tạo project:",
                        result
                    );


                    if (!response.ok ||
                        !result.success ||
                        !result.project) {

                        alert(
                            result.message ||
                            "Không thể tạo dự án!"
                        );

                        return;
                    }


                    // ID project do PostgreSQL / SQLite tạo
                    const projectId =
                        result.project.id;


                    if (!projectId) {

                        alert(
                            "Server không trả về ID dự án!"
                        );

                        return;
                    }


                    // Sau khi tạo thành công,
                    // chuyển sang map.html?id=...
                    window.location.href =
                        `/map.html?id=${projectId}`;

                } catch (err) {

                    console.error(
                        "Lỗi tạo project:",
                        err
                    );

                    alert(
                        "Có lỗi xảy ra khi tạo dự án!"
                    );
                }

            }
        );
    }

});