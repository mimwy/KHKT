// ============================================================
// MAP YOUR LIBRARY - VIEWER
// Chế độ chỉ xem project được chia sẻ
// ============================================================

const canvas = new fabric.Canvas(
    "library-canvas",
    {
        backgroundColor: "#ffffff",
        selection: false,
        preserveObjectStacking: true
    }
);


// ============================================================
// DOM
// ============================================================

const viewerProjectName =
    document.getElementById(
        "viewer-project-name"
    );

const floorList =
    document.getElementById(
        "floor-list"
    );

const boardWrapper =
    document.getElementById(
        "board-wrapper"
    );

const boardScroll =
    document.getElementById(
        "board-scroll"
    );

const zoomOutBtn =
    document.getElementById(
        "zoom-out-btn"
    );

const zoomInBtn =
    document.getElementById(
        "zoom-in-btn"
    );

const zoomResetBtn =
    document.getElementById(
        "zoom-reset-btn"
    );

const fitBoardBtn =
    document.getElementById(
        "fit-board-btn"
    );

const zoomDisplay =
    document.getElementById(
        "zoom-display"
    );

const loadingOverlay =
    document.getElementById(
        "loading-overlay"
    );

const errorOverlay =
    document.getElementById(
        "error-overlay"
    );

const errorMessage =
    document.getElementById(
        "error-message"
    );

const booksModalOverlay =
    document.getElementById(
        "books-modal-overlay"
    );

const booksModalTitle =
    document.getElementById(
        "books-modal-title"
    );

const booksModalClose =
    document.getElementById(
        "books-modal-close"
    );

const bookList =
    document.getElementById(
        "book-list"
    );


// ============================================================
// STATE
// ============================================================

let project = null;

let floors = [];

let currentFloorId = null;

let currentZoom = 1;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;


// ============================================================
// TOKEN
// ============================================================

function getShareToken() {
    const parts =
        window.location.pathname
            .split("/")
            .filter(Boolean);

    const viewIndex =
        parts.indexOf("view");

    if (
        viewIndex !== -1 &&
        parts[viewIndex + 1]
    ) {
        return parts[viewIndex + 1];
    }

    const params =
        new URLSearchParams(
            window.location.search
        );

    return params.get("token");
}


// ============================================================
// ERROR / LOADING
// ============================================================

function showError(message) {
    loadingOverlay.classList.add("hidden");

    errorMessage.textContent =
        message ||
        "Không thể tải bản đồ.";

    errorOverlay.classList.remove(
        "hidden"
    );
}


function hideLoading() {
    loadingOverlay.classList.add(
        "hidden"
    );
}


// ============================================================
// ZOOM - KIỂU CANVA
// ============================================================
//
// Zoom toàn bộ BOARD:
// - Kích thước canvas + wrapper thay đổi theo zoom.
// - Fabric viewport cũng scale cùng mức zoom.
// - Zoom quanh vị trí con trỏ/tâm màn hình.
// - Có mouse wheel zoom trên desktop.
// - Hỗ trợ pinch zoom 2 ngón trên mobile.

function updateZoomDisplay() {
    zoomDisplay.textContent =
        Math.round(currentZoom * 100) + "%";
}


function getBoardScrollLimits() {
    return {
        maxLeft:
            Math.max(
                0,
                boardScroll.scrollWidth -
                    boardScroll.clientWidth
            ),

        maxTop:
            Math.max(
                0,
                boardScroll.scrollHeight -
                    boardScroll.clientHeight
            )
    };
}


function clampScrollPosition() {
    const limits =
        getBoardScrollLimits();

    boardScroll.scrollLeft =
        Math.max(
            0,
            Math.min(
                limits.maxLeft,
                boardScroll.scrollLeft
            )
        );

    boardScroll.scrollTop =
        Math.max(
            0,
            Math.min(
                limits.maxTop,
                boardScroll.scrollTop
            )
        );
}


function centerBoardInViewport() {
    const limits =
        getBoardScrollLimits();

    boardScroll.scrollLeft =
        limits.maxLeft / 2;

    boardScroll.scrollTop =
        limits.maxTop / 2;
}


// Cập nhật kích thước hiển thị của board.
// floor.width / floor.height luôn là kích thước GỐC.
function applyWholeBoardZoom() {
    const floor =
        getCurrentFloor();

    if (!floor) {
        return;
    }

    const baseWidth =
        Number(floor.width) || 1200;

    const baseHeight =
        Number(floor.height) || 800;

    const displayWidth =
        Math.max(
            1,
            Math.round(
                baseWidth * currentZoom
            )
        );

    const displayHeight =
        Math.max(
            1,
            Math.round(
                baseHeight * currentZoom
            )
        );

    // Board thật to/nhỏ theo zoom.
    canvas.setDimensions({
        width: displayWidth,
        height: displayHeight
    });

    // Fabric wrapper chứa lowerCanvas + upperCanvas.
    const wrapper =
        canvas.wrapperEl ||
        canvas.getElement().parentElement;

    if (wrapper) {
        wrapper.style.width =
            displayWidth + "px";

        wrapper.style.height =
            displayHeight + "px";
    }

    // Scale nội dung bên trong board đúng bằng currentZoom.
    canvas.setViewportTransform([
        currentZoom,
        0,
        0,
        currentZoom,
        0,
        0
    ]);

    canvas.calcOffset();
    canvas.requestRenderAll();
    updateZoomDisplay();
}


function setZoom(
    value,
    centerPoint = null
) {
    const newZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                MAX_ZOOM,
                Number(value)
            )
        );

    if (!Number.isFinite(newZoom)) {
        return;
    }

    const oldZoom =
        currentZoom;

    if (Math.abs(newZoom - oldZoom) < 0.001) {
        return;
    }

    // Mặc định zoom quanh tâm vùng đang nhìn.
    if (!centerPoint) {
        centerPoint = {
            x:
                boardScroll.clientWidth / 2,

            y:
                boardScroll.clientHeight / 2
        };
    }

    // Tọa độ điểm đang nhìn trong board (đơn vị gốc, chưa zoom).
    const contentX =
        boardScroll.scrollLeft +
        centerPoint.x;

    const contentY =
        boardScroll.scrollTop +
        centerPoint.y;

    const boardPointX =
        contentX / oldZoom;

    const boardPointY =
        contentY / oldZoom;

    currentZoom =
        newZoom;

    const floor =
        getCurrentFloor();

    if (floor) {
        floor.zoom =
            currentZoom;
    }

    applyWholeBoardZoom();

    // Đưa đúng điểm cũ về lại dưới con trỏ.
    boardScroll.scrollLeft =
        boardPointX * currentZoom -
        centerPoint.x;

    boardScroll.scrollTop =
        boardPointY * currentZoom -
        centerPoint.y;

    clampScrollPosition();
}


function zoomIn() {
    setZoom(
        currentZoom + ZOOM_STEP
    );
}


function zoomOut() {
    setZoom(
        currentZoom - ZOOM_STEP
    );
}


function resetZoom() {
    currentZoom = 1;

    const floor =
        getCurrentFloor();

    if (floor) {
        floor.zoom = 1;
    }

    applyWholeBoardZoom();
    centerBoardInViewport();
}


function fitBoardToScreen() {
    const floor =
        getCurrentFloor();

    if (!floor) {
        return;
    }

    const availableWidth =
        Math.max(
            100,
            boardScroll.clientWidth - 50
        );

    const availableHeight =
        Math.max(
            100,
            boardScroll.clientHeight - 50
        );

    const width =
        Number(floor.width) || 1200;

    const height =
        Number(floor.height) || 800;

    const zoomX =
        availableWidth / width;

    const zoomY =
        availableHeight / height;

    currentZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                zoomX,
                zoomY,
                MAX_ZOOM
            )
        );

    floor.zoom =
        currentZoom;

    applyWholeBoardZoom();
    centerBoardInViewport();
}


// ============================================================
// FLOOR
// ============================================================

function getCurrentFloor() {
    return floors.find(
        floor =>
            String(floor.id) ===
            String(currentFloorId)
    );
}


function renderFloorList() {
    floorList.innerHTML = "";

    floors.forEach(
        floor => {
            const button =
                document.createElement(
                    "button"
                );

            button.type = "button";

            button.className =
                "floor-btn";

            if (
                String(floor.id) ===
                String(currentFloorId)
            ) {
                button.classList.add(
                    "active"
                );
            }

            button.textContent =
                floor.name ||
                "Tầng";

            button.addEventListener(
                "click",
                () => {
                    loadFloor(
                        floor.id
                    );
                }
            );

            floorList.appendChild(
                button
            );
        }
    );
}


function loadFloor(floorId) {
    const floor =
        floors.find(
            item =>
                String(item.id) ===
                String(floorId)
        );

    if (!floor) {
        return;
    }

    currentFloorId =
        floor.id;

    renderFloorList();

    canvas.clear();

    canvas.backgroundColor =
        "#ffffff";

    const width =
        Number(floor.width) ||
        1200;

    const height =
        Number(floor.height) ||
        800;

    canvas.setDimensions({
        width,
        height
    });

    currentZoom =
        Number(floor.zoom) ||
        1;

    if (
        floor.canvasData
    ) {
        canvas.loadFromJSON(
            floor.canvasData,
            () => {
                makeCanvasReadOnly();

                canvas.backgroundColor =
                    "#ffffff";

                applyStoredFloorZoom(
                    floor
                );

                canvas.requestRenderAll();
            }
        );
    } else {
        makeCanvasReadOnly();

        applyWholeBoardZoom(
            0,
            0
        );
    }
}


function applyStoredFloorZoom(
    floor
) {
    currentZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                MAX_ZOOM,
                Number(floor.zoom) ||
                    1
            )
        );

    applyWholeBoardZoom(
        0,
        0
    );
}


// ============================================================
// READ-ONLY
// ============================================================

function makeCanvasReadOnly() {
    canvas.getObjects().forEach(
        object => {
            object.set({
                selectable: false,
                evented: true,
                hasControls: false,
                hasBorders: false,
                lockMovementX: true,
                lockMovementY: true,
                lockScalingX: true,
                lockScalingY: true,
                lockRotation: true
            });

            object.setCoords();
        }
    );

    canvas.discardActiveObject();

    canvas.selection = false;
}


// ============================================================
// BOOKSHELF DATA
// ============================================================

function getBookshelfData(
    bookshelf
) {
    if (
        !bookshelf ||
        !bookshelf.bookshelfData
    ) {
        return {
            name: "Tủ sách",
            items: []
        };
    }

    const data =
        bookshelf.bookshelfData;

    return {
        name:
            data.name ||
            "Tủ sách",

        items:
            Array.isArray(data.items)
                ? data.items
                : []
    };
}


// ============================================================
// BOOKS MODAL
// ============================================================

function closeBooksModal() {
    booksModalOverlay.classList.remove(
        "show"
    );
}


function openBooksModal(
    bookshelf
) {
    const data =
        getBookshelfData(
            bookshelf
        );

    booksModalTitle.textContent =
        data.name;

    bookList.innerHTML = "";

    if (
        !data.items.length
    ) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "empty-books";

        empty.textContent =
            "Tủ sách này chưa có sách hoặc sản phẩm nào.";

        bookList.appendChild(
            empty
        );

        booksModalOverlay.classList.add(
            "show"
        );

        return;
    }

    data.items.forEach(
        (item, index) => {
            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "book-card";

            const image =
                document.createElement(
                    "img"
                );

            image.className =
                "book-image";

            if (item.image) {
                image.src =
                    item.image;

                image.alt =
                    item.name ||
                    `Sách ${index + 1}`;

                image.onerror =
                    () => {
                        image.removeAttribute(
                            "src"
                        );

                        image.classList.add(
                            "empty"
                        );

                        image.textContent =
                            "Không có ảnh";
                    };
            } else {
                image.classList.add(
                    "empty"
                );

                image.alt = "";

                image.style.display =
                    "flex";

                image.style.alignItems =
                    "center";

                image.style.justifyContent =
                    "center";

                image.style.objectFit =
                    "initial";

                image.textContent =
                    "Không có ảnh";
            }

            const content =
                document.createElement(
                    "div"
                );

            content.className =
                "book-content";

            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "book-name";

            name.textContent =
                item.name ||
                `Sách / sản phẩm ${index + 1}`;

            const description =
                document.createElement(
                    "div"
                );

            description.className =
                "book-description";

            description.textContent =
                item.description ||
                "Không có mô tả.";

            content.appendChild(
                name
            );

            content.appendChild(
                description
            );

            card.appendChild(
                image
            );

            card.appendChild(
                content
            );

            bookList.appendChild(
                card
            );
        }
    );

    booksModalOverlay.classList.add(
        "show"
    );
}


booksModalClose.addEventListener(
    "click",
    closeBooksModal
);

booksModalOverlay.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            booksModalOverlay
        ) {
            closeBooksModal();
        }
    }
);


// ============================================================
// DOUBLE CLICK TỦ SÁCH
// ============================================================

canvas.on(
    "mouse:dblclick",
    event => {
        const target =
            event.target;

        if (!target) {
            return;
        }

        if (
            target.objectType !==
            "bookshelf"
        ) {
            return;
        }

        openBooksModal(
            target
        );
    }
);


// ============================================================
// PAN BOARD - KIỂU CANVA
// ============================================================
//
// Viewer là chế độ chỉ xem nên người dùng có thể:
// - Desktop: nhấn giữ chuột trái + kéo.
// - Desktop: nhấn giữ chuột giữa + kéo.
// - Mobile/tablet: chạm giữ một ngón + kéo.
//
// Điểm quan trọng:
// Ta PAN bằng scrollLeft / scrollTop của board-scroll.
// Như vậy người dùng đang di chuyển TOÀN BỘ BOARD trong vùng nhìn,
// không phải di chuyển từng object.
//
// Nếu chỉ click/tap mà không kéo, click/double-click tủ sách
// vẫn được giữ nguyên.

let isPanning = false;
let panPointerId = null;
let panStartX = 0;
let panStartY = 0;
let panStartScrollLeft = 0;
let panStartScrollTop = 0;
let panMoved = false;

const PAN_THRESHOLD = 5;

boardScroll.style.touchAction = "none";
boardScroll.style.overflow = "auto";
boardScroll.style.overscrollBehavior = "contain";
boardScroll.style.userSelect = "none";
boardScroll.style.webkitUserSelect = "none";
boardScroll.style.cursor = "grab";


function startBoardPan(event) {
    const isMouse =
        event.pointerType === "mouse";

    if (
        isMouse &&
        event.button !== 0 &&
        event.button !== 1
    ) {
        return;
    }

    // Không bắt đầu pan nếu không có vùng scroll thực tế.
    const limits =
        getBoardScrollLimits();

    if (
        limits.maxLeft <= 0 &&
        limits.maxTop <= 0
    ) {
        return;
    }

    isPanning = true;
    panPointerId = event.pointerId;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartScrollLeft = boardScroll.scrollLeft;
    panStartScrollTop = boardScroll.scrollTop;
    panMoved = false;

    boardScroll.style.cursor = "grabbing";

    // Không dùng pointer capture ở đây để không chặn
    // click / double-click của Fabric trên các đồ vật.
}


function moveBoardPan(event) {
    if (
        !isPanning ||
        event.pointerId !== panPointerId
    ) {
        return;
    }

    const dx =
        event.clientX - panStartX;

    const dy =
        event.clientY - panStartY;

    if (
        Math.abs(dx) >= PAN_THRESHOLD ||
        Math.abs(dy) >= PAN_THRESHOLD
    ) {
        panMoved = true;
    }

    if (!panMoved) {
        return;
    }

    boardScroll.scrollLeft =
        panStartScrollLeft - dx;

    boardScroll.scrollTop =
        panStartScrollTop - dy;

    clampScrollPosition();

    // Touch/pen: giữ thao tác nằm trong board,
    // không để trang web cuộn theo ngón tay.
    if (
        event.pointerType !== "mouse"
    ) {
        event.preventDefault();
    }
}


function stopBoardPan(event) {
    if (!isPanning) {
        return;
    }

    if (
        event &&
        event.pointerId !== undefined &&
        event.pointerId !== panPointerId
    ) {
        return;
    }

    isPanning = false;
    panPointerId = null;
    boardScroll.style.cursor = "grab";

    // Không cần release pointer capture vì pan dùng
    // pointermove/pointerup ở mức document.
}


boardScroll.addEventListener(
    "pointerdown",
    startBoardPan
);

document.addEventListener(
    "pointermove",
    moveBoardPan,
    { passive: false }
);

document.addEventListener(
    "pointerup",
    stopBoardPan
);

document.addEventListener(
    "pointercancel",
    stopBoardPan
);


// ============================================================
// MOUSE WHEEL ZOOM - KIỂU CANVA
// ============================================================
//
// Không bắt buộc Ctrl.
// Zoom quanh đúng vị trí con trỏ.

boardScroll.addEventListener(
    "wheel",
    event => {
        event.preventDefault();

        const rect =
            boardScroll.getBoundingClientRect();

        const point = {
            x:
                event.clientX - rect.left,
            y:
                event.clientY - rect.top
        };

        const direction =
            event.deltaY < 0
                ? 1
                : -1;

        setZoom(
            currentZoom +
                direction *
                    ZOOM_STEP,
            point
        );
    },
    {
        passive: false
    }
);


// ============================================================
// PINCH ZOOM - MOBILE
// ============================================================

let pinchStartDistance = null;
let pinchStartZoom = 1;
let pinchCenter = null;

function getTouchDistance(touchA, touchB) {
    const dx =
        touchA.clientX - touchB.clientX;

    const dy =
        touchA.clientY - touchB.clientY;

    return Math.hypot(dx, dy);
}


function getTouchCenter(touchA, touchB, rect) {
    return {
        x:
            (
                (touchA.clientX + touchB.clientX) /
                2
            ) - rect.left,

        y:
            (
                (touchA.clientY + touchB.clientY) /
                2
            ) - rect.top
    };
}


boardScroll.addEventListener(
    "touchstart",
    event => {
        if (event.touches.length !== 2) {
            return;
        }

        // Khi chuyển sang 2 ngón, dừng pan một ngón.
        isPanning = false;
        panPointerId = null;
        boardScroll.style.cursor = "grab";

        event.preventDefault();

        const rect =
            boardScroll.getBoundingClientRect();

        pinchStartDistance =
            getTouchDistance(
                event.touches[0],
                event.touches[1]
            );

        pinchStartZoom =
            currentZoom;

        pinchCenter =
            getTouchCenter(
                event.touches[0],
                event.touches[1],
                rect
            );
    },
    {
        passive: false
    }
);


boardScroll.addEventListener(
    "touchmove",
    event => {
        if (
            event.touches.length !== 2 ||
            pinchStartDistance === null
        ) {
            return;
        }

        event.preventDefault();

        const distance =
            getTouchDistance(
                event.touches[0],
                event.touches[1]
            );

        if (distance <= 0) {
            return;
        }

        const scale =
            distance /
            pinchStartDistance;

        setZoom(
            pinchStartZoom * scale,
            pinchCenter
        );
    },
    {
        passive: false
    }
);


function stopPinchZoom() {
    pinchStartDistance = null;
    pinchStartZoom = currentZoom;
    pinchCenter = null;
}

boardScroll.addEventListener(
    "touchend",
    stopPinchZoom
);

boardScroll.addEventListener(
    "touchcancel",
    stopPinchZoom
);


// ============================================================
// LOAD PROJECT
// ============================================================

async function loadSharedProject() {
    const token =
        getShareToken();

    if (!token) {
        showError(
            "Không tìm thấy mã chia sẻ trong đường dẫn."
        );

        return;
    }

    try {
        const response =
            await fetch(
                `/api/shared-project/${encodeURIComponent(token)}`,
                {
                    credentials: "omit"
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success ||
            !result.project
        ) {
            throw new Error(
                result.message ||
                "Link chia sẻ không hợp lệ."
            );
        }

        project =
            result.project;

        viewerProjectName.textContent =
            project.name ||
            "Bản đồ thư viện";

        let savedData = null;

        if (
            project.canvas_data
        ) {
            try {
                savedData =
                    typeof project.canvas_data ===
                    "string"
                        ? JSON.parse(
                              project.canvas_data
                          )
                        : project.canvas_data;
            } catch (error) {
                console.error(
                    "Lỗi đọc canvas_data:",
                    error
                );

                throw new Error(
                    "Dữ liệu bản đồ bị lỗi."
                );
            }
        }

        if (
            savedData &&
            Array.isArray(
                savedData.floors
            ) &&
            savedData.floors.length
        ) {
            floors =
                savedData.floors.map(
                    (
                        floor,
                        index
                    ) => ({
                        id:
                            floor.id ??
                            index + 1,

                        name:
                            floor.name ||
                            `Tầng ${index + 1}`,

                        width:
                            Number(
                                floor.width
                            ) ||
                            1200,

                        height:
                            Number(
                                floor.height
                            ) ||
                            800,

                        zoom:
                            Number(
                                floor.zoom
                            ) ||
                            1,

                        canvasData:
                            floor.canvasData ||
                            null
                    })
                );
        } else {
            floors = [
                {
                    id: 1,
                    name: "Tầng 1",
                    width: 1200,
                    height: 800,
                    zoom: 1,
                    canvasData: null
                }
            ];
        }

        currentFloorId =
            floors[0].id;

        renderFloorList();

        loadFloor(
            currentFloorId
        );

        hideLoading();

        setTimeout(
            () => {
                fitBoardToScreen();
            },
            100
        );

    } catch (error) {
        console.error(
            "Lỗi tải project chia sẻ:",
            error
        );

        showError(
            error.message ||
            "Không thể tải bản đồ."
        );
    }
}


// ============================================================
// BUTTON EVENTS
// ============================================================

zoomInBtn.addEventListener(
    "click",
    zoomIn
);

zoomOutBtn.addEventListener(
    "click",
    zoomOut
);

zoomResetBtn.addEventListener(
    "click",
    resetZoom
);

fitBoardBtn.addEventListener(
    "click",
    fitBoardToScreen
);


// ============================================================
// ESC
// ============================================================

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Escape"
        ) {
            closeBooksModal();
        }
    }
);


// ============================================================
// START
// ============================================================

loadSharedProject();
