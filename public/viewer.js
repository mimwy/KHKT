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
// ZOOM
// ============================================================

function updateZoomDisplay() {
    zoomDisplay.textContent =
        Math.round(currentZoom * 100) + "%";
}


function applyZoom() {
    canvas.setZoom(currentZoom);

    canvas.setViewportTransform([
        currentZoom,
        0,
        0,
        currentZoom,
        canvas.viewportTransform[4],
        canvas.viewportTransform[5]
    ]);

    canvas.requestRenderAll();

    updateZoomDisplay();
}


function setZoom(
    value,
    centerPoint = null
) {
    const oldZoom = currentZoom;

    currentZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                MAX_ZOOM,
                Number(value)
            )
        );

    if (
        !centerPoint
    ) {
        centerPoint = {
            x:
                boardWrapper.clientWidth / 2,

            y:
                boardWrapper.clientHeight / 2
        };
    }

    const point =
        new fabric.Point(
            centerPoint.x,
            centerPoint.y
        );

    canvas.zoomToPoint(
        point,
        currentZoom
    );

    canvas.requestRenderAll();

    updateZoomDisplay();
}


function zoomIn() {
    setZoom(
        Math.min(
            MAX_ZOOM,
            currentZoom + ZOOM_STEP
        )
    );
}


function zoomOut() {
    setZoom(
        Math.max(
            MIN_ZOOM,
            currentZoom - ZOOM_STEP
        )
    );
}


function resetZoom() {
    currentZoom = 1;

    canvas.setViewportTransform([
        1,
        0,
        0,
        1,
        0,
        0
    ]);

    canvas.requestRenderAll();

    updateZoomDisplay();
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
            boardWrapper.clientWidth - 50
        );

    const availableHeight =
        Math.max(
            100,
            boardWrapper.clientHeight - 50
        );

    const width =
        Number(floor.width) || 1200;

    const height =
        Number(floor.height) || 800;

    const zoomX =
        availableWidth / width;

    const zoomY =
        availableHeight / height;

    const newZoom =
        Math.min(
            zoomX,
            zoomY,
            MAX_ZOOM
        );

    currentZoom =
        Math.max(
            MIN_ZOOM,
            newZoom
        );

    canvas.setViewportTransform([
        currentZoom,
        0,
        0,
        currentZoom,
        Math.max(
            0,
            (boardWrapper.clientWidth -
                width * currentZoom) / 2
        ),
        Math.max(
            0,
            (boardWrapper.clientHeight -
                height * currentZoom) / 2
        )
    ]);

    canvas.requestRenderAll();

    updateZoomDisplay();
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

        canvas.setViewportTransform([
            currentZoom,
            0,
            0,
            currentZoom,
            0,
            0
        ]);

        canvas.requestRenderAll();

        updateZoomDisplay();
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

    canvas.setViewportTransform([
        currentZoom,
        0,
        0,
        currentZoom,
        0,
        0
    ]);

    updateZoomDisplay();
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
// PAN BẢN ĐỒ
// ============================================================

let isPanning = false;

let panStartX = 0;
let panStartY = 0;

canvas.on(
    "mouse:down",
    event => {
        if (
            event.e &&
            event.e.button === 1
        ) {
            isPanning = true;

            panStartX =
                event.e.clientX;

            panStartY =
                event.e.clientY;

            canvas.defaultCursor =
                "grabbing";

            canvas.discardActiveObject();

            canvas.requestRenderAll();
        }
    }
);

canvas.on(
    "mouse:move",
    event => {
        if (!isPanning) {
            return;
        }

        const e =
            event.e;

        const vpt =
            canvas.viewportTransform;

        vpt[4] +=
            e.clientX -
            panStartX;

        vpt[5] +=
            e.clientY -
            panStartY;

        canvas.requestRenderAll();

        panStartX =
            e.clientX;

        panStartY =
            e.clientY;
    }
);

canvas.on(
    "mouse:up",
    () => {
        isPanning = false;

        canvas.defaultCursor =
            "default";
    }
);


// ============================================================
// MOUSE WHEEL ZOOM
// ============================================================

boardWrapper.addEventListener(
    "wheel",
    event => {
        if (
            !event.ctrlKey &&
            !event.metaKey
        ) {
            return;
        }

        event.preventDefault();

        const rect =
            boardWrapper.getBoundingClientRect();

        const point = {
            x:
                event.clientX -
                rect.left,

            y:
                event.clientY -
                rect.top
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
