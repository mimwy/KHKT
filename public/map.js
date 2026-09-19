// ==========================================
// KHỞI TẠO CANVAS
// ==========================================

const canvas = new fabric.Canvas("library-canvas", {
    backgroundColor: "#ffffff",
    selection: true,
    preserveObjectStacking: true
});


// ==========================================
// HTML ELEMENTS
// ==========================================

const objectButtons =
    document.querySelectorAll(".library-object");

const deleteObjectBtn =
    document.getElementById("delete-object-btn");

const clearBoardBtn =
    document.getElementById("clear-board-btn");

const undoBtn =
    document.getElementById("undo-btn");

const redoBtn =
    document.getElementById("redo-btn");

const resizeBoardBtn =
    document.getElementById("resize-board-btn");

const boardWidthInput =
    document.getElementById("board-width");

const boardHeightInput =
    document.getElementById("board-height");

const saveProjectBtn =
    document.getElementById("save-project-btn");

const projectNameInput =
    document.getElementById("project-name");

const fontFamilySelect =
    document.getElementById("font-family");

const fontSizeInput =
    document.getElementById("font-size");

const floorList =
    document.getElementById("floor-list");

const addFloorBtn =
    document.getElementById("add-floor-btn");

const zoomSlider =
    document.getElementById("zoom-slider");

const zoomValue =
    document.getElementById("zoom-value");

const zoomInBtn =
    document.getElementById("zoom-in-btn");

const zoomOutBtn =
    document.getElementById("zoom-out-btn");

const resetZoomBtn =
    document.getElementById("reset-zoom-btn");

const zoomDisplay =
    document.getElementById("zoom-display");

const canvasViewport =
    document.getElementById("canvas-viewport");


// ==========================================
// BOOKSHELF MODAL ELEMENTS
// ==========================================

const bookshelfModalOverlay =
    document.getElementById(
        "bookshelf-modal-overlay"
    );

const bookshelfCloseBtn =
    document.getElementById(
        "bookshelf-close-btn"
    );

const bookshelfCancelBtn =
    document.getElementById(
        "bookshelf-cancel-btn"
    );

const bookshelfSaveBtn =
    document.getElementById(
        "bookshelf-save-btn"
    );

const bookshelfAddItemBtn =
    document.getElementById(
        "bookshelf-add-item-btn"
    );

const bookshelfNameInput =
    document.getElementById(
        "bookshelf-name"
    );

const bookshelfItemsContainer =
    document.getElementById(
        "bookshelf-items"
    );


// ==========================================
// FLOOR DATA
// ==========================================

let floors = [
    {
        id: 1,

        name: "Tầng 1",

        width: 1200,

        height: 800,

        zoom: 1,

        canvasData: null
    }
];


let currentFloorId = 1;


// Dùng để tránh callback load tầng cũ
// ghi đè lên tầng mới

let floorLoadToken = 0;


// ==========================================
// ZOOM
// ==========================================

let currentZoom = 1;

const MIN_ZOOM = 0.25;

const MAX_ZOOM = 3;

const ZOOM_STEP = 0.1;


// ==========================================
// COPY / PASTE
// ==========================================

let clipboardData = null;

const COPY_OFFSET = 30;

// ==========================================
// UNDO / REDO
// ==========================================
// Mỗi tầng có lịch sử riêng.
const historyByFloor = new Map();
const HISTORY_LIMIT = 80;
let historyRestoring = false;

function makeHistorySnapshot() {
    const floor = getCurrentFloor();
    if (!floor) return null;

    return {
        width: Number(floor.width),
        height: Number(floor.height),
        canvasData: canvas.toJSON(["objectType", "bookshelfData"])
    };
}

function getFloorHistory(floorId = currentFloorId) {
    const key = String(floorId);
    if (!historyByFloor.has(key)) {
        historyByFloor.set(key, {
            undo: [],
            redo: []
        });
    }
    return historyByFloor.get(key);
}

function updateHistoryButtons() {
    const history = getFloorHistory();
    if (undoBtn) undoBtn.disabled = history.undo.length <= 1;
    if (redoBtn) redoBtn.disabled = history.redo.length === 0;
}

function resetFloorHistory() {
    const history = getFloorHistory();
    const snapshot = makeHistorySnapshot();
    history.undo = snapshot ? [snapshot] : [];
    history.redo = [];
    updateHistoryButtons();
}

function recordHistory() {
    if (historyRestoring) return;

    const history = getFloorHistory();
    const snapshot = makeHistorySnapshot();
    if (!snapshot) return;

    const previous = history.undo[history.undo.length - 1];
    const previousJSON = previous ? JSON.stringify(previous) : "";
    const currentJSON = JSON.stringify(snapshot);

    if (previousJSON === currentJSON) {
        updateHistoryButtons();
        return;
    }

    history.undo.push(snapshot);
    if (history.undo.length > HISTORY_LIMIT) {
        history.undo.shift();
    }
    history.redo = [];
    updateHistoryButtons();
}

function restoreHistorySnapshot(snapshot) {
    if (!snapshot) return;

    historyRestoring = true;
    const floor = getCurrentFloor();
    if (!floor) {
        historyRestoring = false;
        return;
    }

    floor.width = Number(snapshot.width);
    floor.height = Number(snapshot.height);

    if (boardWidthInput) boardWidthInput.value = floor.width;
    if (boardHeightInput) boardHeightInput.value = floor.height;

    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.setDimensions({
        width: floor.width,
        height: floor.height
    });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    canvas.loadFromJSON(snapshot.canvasData, () => {
        historyRestoring = false;
        canvas.backgroundColor = "#ffffff";
        applyZoom();
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        updateHistoryButtons();
    });
}

function undo() {
    const history = getFloorHistory();
    if (history.undo.length <= 1) return;

    const current = history.undo.pop();
    history.redo.push(current);
    restoreHistorySnapshot(history.undo[history.undo.length - 1]);
}

function redo() {
    const history = getFloorHistory();
    if (!history.redo.length) return;

    const snapshot = history.redo.pop();
    history.undo.push(snapshot);
    restoreHistorySnapshot(snapshot);
}

if (undoBtn) undoBtn.addEventListener("click", undo);
if (redoBtn) redoBtn.addEventListener("click", redo);


// ==========================================
// BOOKSHELF STATE
// ==========================================

// Tủ đang được mở

let selectedBookshelf = null;


// Dữ liệu tạm thời trong modal

let editingBookshelfData = null;


// ==========================================
// GET CURRENT FLOOR
// ==========================================

function getCurrentFloor() {

    return floors.find(
        floor =>
            String(floor.id) ===
            String(currentFloorId)
    );

}


// ==========================================
// UPDATE ZOOM DISPLAY
// ==========================================

function updateZoomDisplay() {

    const percent =
        Math.round(
            currentZoom * 100
        ) + "%";


    if (zoomDisplay) {

        zoomDisplay.textContent =
            percent;

    }


    if (zoomValue) {

        zoomValue.textContent =
            percent;

    }


    if (zoomSlider) {

        zoomSlider.value =
            Math.round(
                currentZoom * 100
            );

    }

}


// ==========================================
// APPLY ZOOM
// ==========================================

function applyZoom() {

    const floor =
        getCurrentFloor();

    if (!floor) {
        return;
    }


    const displayWidth =
        Math.max(
            1,
            Math.round(
                floor.width *
                currentZoom
            )
        );


    const displayHeight =
        Math.max(
            1,
            Math.round(
                floor.height *
                currentZoom
            )
        );


    canvas.setDimensions({

        width:
            displayWidth,

        height:
            displayHeight

    });


    canvas.setViewportTransform([

        currentZoom,
        0,

        0,
        currentZoom,

        0,
        0

    ]);


    const wrapper =
        document.getElementById(
            "canvas-wrapper"
        );


    if (wrapper) {

        wrapper.style.width =
            displayWidth + "px";

        wrapper.style.height =
            displayHeight + "px";

    }


    canvas.calcOffset();

    canvas.requestRenderAll();

    updateZoomDisplay();

}


// ==========================================
// SET ZOOM
// ==========================================

function setCanvasZoom(newZoom) {

    newZoom =
        Number(newZoom);


    if (
        !Number.isFinite(newZoom)
    ) {

        newZoom = 1;

    }


    newZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                MAX_ZOOM,
                newZoom
            )
        );


    currentZoom =
        newZoom;


    const floor =
        getCurrentFloor();


    if (floor) {

        floor.zoom =
            currentZoom;

    }


    applyZoom();

}


// ==========================================
// RESET ZOOM
// ==========================================

function resetZoom() {

    setCanvasZoom(1);

}


// ==========================================
// ZOOM BUTTONS
// ==========================================

if (zoomInBtn) {

    zoomInBtn.addEventListener(
        "click",
        () => {

            setCanvasZoom(
                currentZoom +
                ZOOM_STEP
            );

        }
    );

}


if (zoomOutBtn) {

    zoomOutBtn.addEventListener(
        "click",
        () => {

            setCanvasZoom(
                currentZoom -
                ZOOM_STEP
            );

        }
    );

}


if (resetZoomBtn) {

    resetZoomBtn.addEventListener(
        "click",
        resetZoom
    );

}


// ==========================================
// ZOOM SLIDER
// ==========================================

if (zoomSlider) {

    zoomSlider.addEventListener(
        "input",
        () => {

            const zoom =
                Number(
                    zoomSlider.value
                ) / 100;

            setCanvasZoom(
                zoom
            );

        }
    );

}


// ==========================================
// CTRL + MOUSE WHEEL ZOOM
// ==========================================

canvas.on(
    "mouse:wheel",
    function(opt) {

        const event =
            opt.e;


        if (!event.ctrlKey) {
            return;
        }


        event.preventDefault();

        event.stopPropagation();


        let zoom =
            currentZoom *
            Math.pow(
                0.999,
                event.deltaY
            );


        zoom =
            Math.max(
                MIN_ZOOM,
                Math.min(
                    MAX_ZOOM,
                    zoom
                )
            );


        setCanvasZoom(
            zoom
        );

    }
);


// ==========================================
// GIỮ CHUỘT ĐÚNG SAU KHI ZOOM
// ==========================================

canvas.on(
    "after:render",
    function() {

        canvas.calcOffset();

    }
);


// ==========================================
// FABRIC HISTORY EVENTS
// ==========================================
canvas.on("object:added", () => recordHistory());
canvas.on("object:removed", () => recordHistory());
canvas.on("object:modified", () => recordHistory());

// ==========================================
// SAVE CURRENT FLOOR STATE
// ==========================================

function saveCurrentFloorState() {

    const floor =
        getCurrentFloor();


    if (!floor) {
        return;
    }


    // Lưu kích thước logic

    floor.width =
        Number(floor.width);

    floor.height =
        Number(floor.height);


    // Lưu zoom riêng

    floor.zoom =
        currentZoom;


    // Lưu toàn bộ object
    // + objectType
    // + bookshelfData

    floor.canvasData =
        canvas.toJSON([

            "objectType",

            "bookshelfData"

        ]);

}


// ==========================================
// LOAD FLOOR
// ==========================================

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


    const loadToken =
        ++floorLoadToken;


    // Lưu tầng hiện tại
    // trước khi chuyển tầng

    saveCurrentFloorState();


    // Chuyển tầng

    currentFloorId =
        floor.id;


    // Cập nhật active floor

    renderFloorList();


    // ======================================
    // LOAD ZOOM RIÊNG
    // ======================================

    currentZoom =
        Number(floor.zoom);


    if (
        !Number.isFinite(
            currentZoom
        )
    ) {

        currentZoom = 1;

    }


    currentZoom =
        Math.max(
            MIN_ZOOM,
            Math.min(
                MAX_ZOOM,
                currentZoom
            )
        );


    floor.zoom =
        currentZoom;


    // ======================================
    // LOAD BOARD SIZE
    // ======================================

    if (boardWidthInput) {

        boardWidthInput.value =
            floor.width;

    }


    if (boardHeightInput) {

        boardHeightInput.value =
            floor.height;

    }


    // ======================================
    // CLEAR OLD CANVAS
    // ======================================

    historyRestoring = true;
    canvas.clear();

    canvas.backgroundColor =
        "#ffffff";


    // Đặt về kích thước logic
    // trước khi load object

    canvas.setDimensions({

        width:
            Number(floor.width),

        height:
            Number(floor.height)

    });


    canvas.setViewportTransform([

        1,
        0,

        0,
        1,

        0,
        0

    ]);


    canvas.requestRenderAll();


    // ======================================
    // LOAD OBJECTS
    // ======================================

    if (floor.canvasData) {

        canvas.loadFromJSON(

            floor.canvasData,

            () => {

                // Nếu người dùng đã chuyển
                // sang tầng khác trong lúc load

                if (
                    loadToken !==
                    floorLoadToken
                ) {

                    return;

                }


                if (
                    String(
                        currentFloorId
                    ) !==
                    String(floor.id)
                ) {

                    return;

                }


                canvas.backgroundColor =
                    "#ffffff";

                // Kết thúc chế độ khôi phục để các thao tác mới
                // được ghi vào lịch sử Undo/Redo.
                historyRestoring = false;
                resetFloorHistory();

                // Khôi phục zoom của tầng

                applyZoom();


                renderFloorList();


                canvas.requestRenderAll();

            }

        );

    }

    else {

        historyRestoring = false;
        resetFloorHistory();
        applyZoom();

        renderFloorList();

        canvas.requestRenderAll();

    }

}


// ==========================================
// FLOOR LIST
// ==========================================

function renderFloorList() {

    if (!floorList) {
        return;
    }


    floorList.innerHTML = "";


    floors.forEach(
        floor => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "floor-item";


            const floorButton =
                document.createElement(
                    "button"
                );


            floorButton.type =
                "button";


            floorButton.className =
                "floor-btn";


            // Tầng hiện tại

            if (
                String(floor.id) ===
                String(currentFloorId)
            ) {

                floorButton.classList.add(
                    "active"
                );

            }


            floorButton.textContent =
                floor.name;


            floorButton.addEventListener(
                "click",
                () => {

                    loadFloor(
                        floor.id
                    );

                }
            );


            item.appendChild(
                floorButton
            );


            // Nút xóa

            if (
                floors.length > 1
            ) {

                const deleteButton =
                    document.createElement(
                        "button"
                    );


                deleteButton.type =
                    "button";


                deleteButton.className =
                    "delete-floor-btn";


                deleteButton.textContent =
                    "×";


                deleteButton.title =
                    "Xóa tầng";


                deleteButton.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        deleteFloor(
                            floor.id
                        );

                    }
                );


                item.appendChild(
                    deleteButton
                );

            }


            floorList.appendChild(
                item
            );

        }
    );

}


// ==========================================
// ADD FLOOR
// ==========================================

function addFloor() {

    saveCurrentFloorState();


    const newFloor = {

        id:
            Date.now(),

        name:
            "Tầng " +
            (floors.length + 1),

        width:
            1200,

        height:
            800,

        zoom:
            1,

        canvasData:
            null

    };


    floors.push(
        newFloor
    );


    loadFloor(
        newFloor.id
    );

}


// ==========================================
// ADD FLOOR BUTTON
// ==========================================

if (addFloorBtn) {

    addFloorBtn.addEventListener(
        "click",
        addFloor
    );

}


// ==========================================
// DELETE FLOOR
// ==========================================

function deleteFloor(floorId) {

    if (
        floors.length <= 1
    ) {

        alert(
            "Dự án phải có ít nhất một tầng."
        );

        return;

    }


    const floor =
        floors.find(
            item =>
                String(item.id) ===
                String(floorId)
        );


    if (!floor) {
        return;
    }


    const confirmDelete =
        confirm(
            `Bạn có chắc muốn xóa ${floor.name}?`
        );


    if (!confirmDelete) {
        return;
    }


    const floorIndex =
        floors.findIndex(
            item =>
                String(item.id) ===
                String(floorId)
        );


    if (floorIndex < 0) {
        return;
    }


    const deletingCurrent =
        String(floorId) ===
        String(currentFloorId);


    floors.splice(
        floorIndex,
        1
    );


    if (deletingCurrent) {

        const newIndex =
            Math.min(
                floorIndex,
                floors.length - 1
            );


        loadFloor(
            floors[newIndex].id
        );

    }

    else {

        renderFloorList();

    }

}


// ==========================================
// ADD OBJECT TO CANVAS
// ==========================================

function addToCanvas(object) {

    const floor =
        getCurrentFloor();


    if (!floor) {
        return;
    }


    object.set({

        left:
            floor.width / 2,

        top:
            floor.height / 2,

        originX:
            "center",

        originY:
            "center"

    });


    object.setCoords();


    canvas.add(
        object
    );


    canvas.setActiveObject(
        object
    );


    canvas.requestRenderAll();

}


// ==========================================
// CREATE BOOKSHELF
// ==========================================

function createBookshelf() {

    const parts = [];


    const shelf =
        new fabric.Rect({

            left: 0,

            top: 0,

            width: 220,

            height: 70,

            fill: "#9A6A3A",

            stroke: "#4A2C14",

            strokeWidth: 3,

            rx: 6,

            ry: 6

        });


    parts.push(
        shelf
    );


    for (
        let i = 1;
        i < 7;
        i++
    ) {

        parts.push(

            new fabric.Line(

                [
                    i * 30,
                    4,
                    i * 30,
                    66
                ],

                {

                    stroke:
                        "#E8C39E",

                    strokeWidth:
                        3

                }

            )

        );

    }


    const bookshelf =
        new fabric.Group(

            parts,

            {

                objectType:
                    "bookshelf",

                bookshelfData: {

                    name:
                        "Tủ sách",

                    items: []

                }

            }

        );


    return bookshelf;

}


// ==========================================
// CREATE TABLE
// ==========================================

function createTable() {

    const tableTop =
        new fabric.Rect({

            width:
                190,

            height:
                110,

            fill:
                "#D9A66D",

            stroke:
                "#8B5A2B",

            strokeWidth:
                4,

            rx:
                12,

            ry:
                12

        });


    const inner =
        new fabric.Rect({

            left:
                12,

            top:
                12,

            width:
                166,

            height:
                86,

            fill:
                "rgba(255,255,255,0.08)",

            stroke:
                "#C28A4C",

            strokeWidth:
                2,

            rx:
                8,

            ry:
                8

        });


    return new fabric.Group(

        [
            tableTop,
            inner
        ],

        {

            objectType:
                "table"

        }

    );

}


// ==========================================
// CREATE CHAIR
// ==========================================

function createChair() {

    const back =
        new fabric.Rect({

            width:
                65,

            height:
                20,

            left:
                0,

            top:
                0,

            fill:
                "#475569",

            rx:
                6,

            ry:
                6

        });


    const seat =
        new fabric.Rect({

            width:
                65,

            height:
                55,

            left:
                0,

            top:
                25,

            fill:
                "#64748B",

            stroke:
                "#334155",

            strokeWidth:
                2,

            rx:
                8,

            ry:
                8

        });


    return new fabric.Group(

        [
            back,
            seat
        ],

        {

            objectType:
                "chair"

        }

    );

}


// ==========================================
// CREATE COMPUTER
// ==========================================

function createComputer() {

    const monitor =
        new fabric.Rect({

            width:
                95,

            height:
                60,

            fill:
                "#334155",

            stroke:
                "#111827",

            strokeWidth:
                4,

            rx:
                6,

            ry:
                6

        });


    const screen =
        new fabric.Rect({

            left:
                8,

            top:
                8,

            width:
                79,

            height:
                44,

            fill:
                "#60A5FA",

            rx:
                3,

            ry:
                3

        });


    const stand =
        new fabric.Rect({

            left:
                40,

            top:
                60,

            width:
                15,

            height:
                25,

            fill:
                "#64748B"

        });


    const base =
        new fabric.Rect({

            left:
                12,

            top:
                85,

            width:
                70,

            height:
                12,

            fill:
                "#475569",

            rx:
                5,

            ry:
                5

        });


    return new fabric.Group(

        [
            monitor,
            screen,
            stand,
            base
        ],

        {

            objectType:
                "computer"

        }

    );

}


// ==========================================
// CREATE DOOR
// ==========================================

function createDoor() {

    const door =
        new fabric.Rect({

            width:
                120,

            height:
                18,

            fill:
                "#A16207",

            stroke:
                "#713F12",

            strokeWidth:
                2

        });


    const arc =
        new fabric.Path(

            "M 0 0 Q 90 0 90 90",

            {

                fill:
                    "transparent",

                stroke:
                    "#A16207",

                strokeWidth:
                    2

            }

        );


    return new fabric.Group(

        [
            door,
            arc
        ],

        {

            objectType:
                "door"

        }

    );

}


// ==========================================
// CREATE WINDOW
// ==========================================

function createWindow() {

    const frame =
        new fabric.Rect({

            width:
                130,

            height:
                24,

            fill:
                "#7DD3FC",

            stroke:
                "#0284C7",

            strokeWidth:
                3,

            rx:
                3,

            ry:
                3

        });


    const line1 =
        new fabric.Line(

            [
                43,
                0,
                43,
                24
            ],

            {

                stroke:
                    "#0284C7",

                strokeWidth:
                    2

            }

        );


    const line2 =
        new fabric.Line(

            [
                86,
                0,
                86,
                24
            ],

            {

                stroke:
                    "#0284C7",

                strokeWidth:
                    2

            }

        );


    return new fabric.Group(

        [
            frame,
            line1,
            line2
        ],

        {

            objectType:
                "window"

        }

    );

}


// ==========================================
// CREATE ACCOUNTING DESK
// ==========================================
function createAccountingDesk() {
    const parts = [];

    parts.push(new fabric.Rect({
        left: 0,
        top: 0,
        width: 230,
        height: 125,
        rx: 12,
        ry: 12,
        fill: "#B77945",
        stroke: "#6B3F1F",
        strokeWidth: 4
    }));

    parts.push(new fabric.Rect({
        left: 14,
        top: 12,
        width: 202,
        height: 55,
        rx: 7,
        ry: 7,
        fill: "#D9A66D",
        stroke: "#8B5A2B",
        strokeWidth: 2
    }));

    // Màn hình
    parts.push(new fabric.Rect({
        left: 82,
        top: 23,
        width: 66,
        height: 35,
        rx: 3,
        ry: 3,
        fill: "#334155",
        stroke: "#111827",
        strokeWidth: 2
    }));
    parts.push(new fabric.Rect({
        left: 89,
        top: 29,
        width: 52,
        height: 23,
        fill: "#93C5FD",
        rx: 2,
        ry: 2
    }));

    // Bàn phím + máy tính cầm tay
    parts.push(new fabric.Rect({
        left: 70,
        top: 72,
        width: 90,
        height: 20,
        rx: 4,
        ry: 4,
        fill: "#E5E7EB",
        stroke: "#64748B",
        strokeWidth: 2
    }));
    parts.push(new fabric.Rect({
        left: 171,
        top: 72,
        width: 32,
        height: 38,
        rx: 4,
        ry: 4,
        fill: "#475569"
    }));

    // Ngăn kéo
    parts.push(new fabric.Rect({
        left: 18,
        top: 77,
        width: 42,
        height: 30,
        rx: 4,
        ry: 4,
        fill: "#8B5A2B",
        stroke: "#5B371B",
        strokeWidth: 2
    }));
    parts.push(new fabric.Circle({
        left: 36,
        top: 88,
        radius: 3,
        fill: "#F8FAFC"
    }));

    return new fabric.Group(parts, {
        objectType: "accountingDesk"
    });
}

// ==========================================
// CREATE SQUARE PLANT
// ==========================================
function createSquarePlant() {
    const parts = [];

    parts.push(new fabric.Rect({
        left: 18,
        top: 52,
        width: 64,
        height: 50,
        rx: 6,
        ry: 6,
        fill: "#B45309",
        stroke: "#78350F",
        strokeWidth: 3
    }));

    parts.push(new fabric.Rect({
        left: 24,
        top: 48,
        width: 52,
        height: 12,
        rx: 4,
        ry: 4,
        fill: "#92400E"
    }));

    parts.push(new fabric.Line([50, 54, 50, 22], {
        stroke: "#166534",
        strokeWidth: 6
    }));

    parts.push(new fabric.Circle({ left: 26, top: 8, radius: 19, fill: "#22C55E" }));
    parts.push(new fabric.Circle({ left: 48, top: 17, radius: 17, fill: "#16A34A" }));
    parts.push(new fabric.Circle({ left: 12, top: 24, radius: 15, fill: "#15803D" }));

    return new fabric.Group(parts, {
        objectType: "squarePlant"
    });
}

// ==========================================
// CREATE ROUND PLANT
// ==========================================
function createRoundPlant() {
    const parts = [];

    parts.push(new fabric.Ellipse({
        left: 15,
        top: 58,
        rx: 36,
        ry: 23,
        fill: "#B45309",
        stroke: "#78350F",
        strokeWidth: 3
    }));

    parts.push(new fabric.Ellipse({
        left: 21,
        top: 51,
        rx: 30,
        ry: 10,
        fill: "#92400E"
    }));

    parts.push(new fabric.Line([51, 55, 51, 24], {
        stroke: "#166534",
        strokeWidth: 6
    }));

    parts.push(new fabric.Circle({ left: 28, top: 7, radius: 20, fill: "#22C55E" }));
    parts.push(new fabric.Circle({ left: 48, top: 20, radius: 16, fill: "#16A34A" }));
    parts.push(new fabric.Circle({ left: 10, top: 23, radius: 16, fill: "#15803D" }));

    return new fabric.Group(parts, {
        objectType: "roundPlant"
    });
}

// ==========================================
// FREE SHAPES
// ==========================================
function createFreeRectangle() {
    return new fabric.Rect({
        width: 150,
        height: 90,
        fill: "#CBD5E1",
        stroke: "#475569",
        strokeWidth: 3,
        rx: 5,
        ry: 5,
        objectType: "freeRectangle"
    });
}

function createFreeCircle() {
    return new fabric.Circle({
        radius: 55,
        fill: "#CBD5E1",
        stroke: "#475569",
        strokeWidth: 3,
        objectType: "freeCircle"
    });
}

function createFreeTriangle() {
    return new fabric.Triangle({
        width: 120,
        height: 105,
        fill: "#CBD5E1",
        stroke: "#475569",
        strokeWidth: 3,
        objectType: "freeTriangle"
    });
}

function createFreeEllipse() {
    return new fabric.Ellipse({
        rx: 85,
        ry: 50,
        fill: "#CBD5E1",
        stroke: "#475569",
        strokeWidth: 3,
        objectType: "freeEllipse"
    });
}

// ==========================================
// CREATE TEXT
// ==========================================

function createText() {

    return new fabric.IText(

        "Nhập nội dung",

        {

            fontFamily:
                fontFamilySelect
                    ? fontFamilySelect.value
                    : "Arial",

            fontSize:
                fontSizeInput
                    ? Number(
                        fontSizeInput.value
                    )
                    : 20,

            fill:
                "#111827",

            objectType:
                "text"

        }

    );

}


// ==========================================
// OBJECT BUTTONS
// ==========================================

objectButtons.forEach(

    button => {

        button.addEventListener(

            "click",

            () => {

                const type =
                    button.dataset.object;


                let object =
                    null;


                if (
                    type ===
                    "bookshelf"
                ) {

                    object =
                        createBookshelf();

                }

                else if (
                    type ===
                    "table"
                ) {

                    object =
                        createTable();

                }

                else if (
                    type ===
                    "chair"
                ) {

                    object =
                        createChair();

                }

                else if (
                    type ===
                    "computer"
                ) {

                    object =
                        createComputer();

                }

                else if (
                    type ===
                    "door"
                ) {

                    object =
                        createDoor();

                }

                else if (
                    type ===
                    "window"
                ) {

                    object =
                        createWindow();

                }

                else if (
                    type ===
                    "accountingDesk"
                ) {

                    object =
                        createAccountingDesk();

                }

                else if (
                    type ===
                    "squarePlant"
                ) {

                    object =
                        createSquarePlant();

                }

                else if (
                    type ===
                    "roundPlant"
                ) {

                    object =
                        createRoundPlant();

                }

                else if (
                    type ===
                    "freeRectangle"
                ) {

                    object =
                        createFreeRectangle();

                }

                else if (
                    type ===
                    "freeCircle"
                ) {

                    object =
                        createFreeCircle();

                }

                else if (
                    type ===
                    "freeTriangle"
                ) {

                    object =
                        createFreeTriangle();

                }

                else if (
                    type ===
                    "freeEllipse"
                ) {

                    object =
                        createFreeEllipse();

                }

                else if (
                    type ===
                    "text"
                ) {

                    object =
                        createText();

                }


                if (object) {

                    addToCanvas(
                        object
                    );

                }

            }

        );

    }

);


// ==========================================
// BOOKSHELF DATA NORMALIZATION
// ==========================================

function getBookshelfData(
    bookshelf
) {

    if (
        !bookshelf.bookshelfData
    ) {

        bookshelf.bookshelfData = {

            name:
                "Tủ sách",

            items: []

        };

    }


    if (
        !Array.isArray(
            bookshelf.bookshelfData.items
        )
    ) {

        bookshelf.bookshelfData.items =
            [];

    }


    if (
        !bookshelf.bookshelfData.name
    ) {

        bookshelf.bookshelfData.name =
            "Tủ sách";

    }


    return bookshelf.bookshelfData;

}


// ==========================================
// OPEN BOOKSHELF MODAL
// ==========================================

function openBookshelfModal(
    bookshelf
) {

    if (!bookshelf) {
        return;
    }


    if (
        bookshelf.objectType !==
        "bookshelf"
    ) {

        return;

    }


    selectedBookshelf =
        bookshelf;


    const data =
        getBookshelfData(
            bookshelf
        );


    // Copy dữ liệu sang state tạm
    // để Cancel không làm thay đổi tủ

    editingBookshelfData = {

        name:
            data.name || "Tủ sách",

        items:
            data.items.map(
                item => ({

                    id:
                        item.id ||
                        Date.now() +
                        Math.random(),

                    name:
                        item.name || "",

                    image:
                        item.image || "",

                    description:
                        item.description || ""

                })
            )

    };


    if (bookshelfNameInput) {

        bookshelfNameInput.value =
            editingBookshelfData.name;

    }


    renderBookshelfItems();


    if (bookshelfModalOverlay) {

        bookshelfModalOverlay.classList.add(
            "show"
        );

    }


    if (bookshelfNameInput) {

        setTimeout(
            () => {

                bookshelfNameInput.focus();

            },
            50
        );

    }

}


// ==========================================
// CLOSE BOOKSHELF MODAL
// ==========================================

function closeBookshelfModal() {

    if (bookshelfModalOverlay) {

        bookshelfModalOverlay.classList.remove(
            "show"
        );

    }


    selectedBookshelf =
        null;


    editingBookshelfData =
        null;

}


// ==========================================
// RENDER BOOKSHELF ITEMS
// ==========================================

function renderBookshelfItems() {

    if (
        !bookshelfItemsContainer
    ) {

        return;

    }


    bookshelfItemsContainer.innerHTML =
        "";


    if (
        !editingBookshelfData ||
        !editingBookshelfData.items.length
    ) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "bookshelf-empty";


        empty.textContent =
            "Tủ này chưa có sách hoặc sản phẩm nào.";


        bookshelfItemsContainer.appendChild(
            empty
        );


        return;

    }


    editingBookshelfData.items.forEach(

        (item, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "bookshelf-product-card";


            const grid =
                document.createElement(
                    "div"
                );


            grid.className =
                "bookshelf-product-grid";


            // =================================
            // IMAGE
            // =================================

            const imageBox =
                document.createElement(
                    "div"
                );


            imageBox.className =
                "bookshelf-image-box";


            if (item.image) {

                const image =
                    document.createElement(
                        "img"
                    );


                image.src =
                    item.image;


                image.alt =
                    item.name ||
                    "Ảnh sản phẩm";


                imageBox.appendChild(
                    image
                );

            }

            else {

                imageBox.textContent =
                    "Chưa có hình";

            }


            // =================================
            // FIELDS
            // =================================

            const fields =
                document.createElement(
                    "div"
                );


            fields.className =
                "bookshelf-product-fields";


            const nameInput =
                document.createElement(
                    "input"
                );


            nameInput.type =
                "text";


            nameInput.placeholder =
                "Tên sách / sản phẩm";


            nameInput.value =
                item.name;


            nameInput.addEventListener(
                "input",
                () => {

                    item.name =
                        nameInput.value;

                }
            );


            const imageInput =
                document.createElement(
                    "input"
                );


            imageInput.type =
                "file";


            imageInput.accept =
                "image/*";


            imageInput.className =
                "bookshelf-image-input";


            imageInput.addEventListener(
                "change",
                event => {

                    const file =
                        event.target.files[0];


                    if (!file) {
                        return;
                    }


                    // Giới hạn ảnh 8 MB

                    if (
                        file.size >
                        8 * 1024 * 1024
                    ) {

                        alert(
                            "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 8 MB."
                        );

                        imageInput.value =
                            "";

                        return;

                    }


                    const reader =
                        new FileReader();


                    reader.onload =
                        function(e) {

                            item.image =
                                e.target.result;


                            renderBookshelfItems();

                        };


                    reader.readAsDataURL(
                        file
                    );

                }
            );


            const descriptionInput =
                document.createElement(
                    "textarea"
                );


            descriptionInput.placeholder =
                "Mô tả sách / sản phẩm";


            descriptionInput.value =
                item.description;


            descriptionInput.addEventListener(
                "input",
                () => {

                    item.description =
                        descriptionInput.value;

                }
            );


            fields.appendChild(
                nameInput
            );


            fields.appendChild(
                imageInput
            );


            fields.appendChild(
                descriptionInput
            );


            grid.appendChild(
                imageBox
            );


            grid.appendChild(
                fields
            );


            // =================================
            // ACTIONS
            // =================================

            const actions =
                document.createElement(
                    "div"
                );


            actions.className =
                "bookshelf-product-actions";


            const number =
                document.createElement(
                    "span"
                );


            number.style.color =
                "#64748b";


            number.style.fontSize =
                "12px";


            number.textContent =
                "Sản phẩm #" +
                (index + 1);


            const removeButton =
                document.createElement(
                    "button"
                );


            removeButton.type =
                "button";


            removeButton.className =
                "bookshelf-remove-item";


            removeButton.textContent =
                "Xóa mục này";


            removeButton.addEventListener(
                "click",
                () => {

                    const confirmRemove =
                        confirm(
                            "Bạn có chắc muốn xóa sách/sản phẩm này?"
                        );


                    if (
                        !confirmRemove
                    ) {

                        return;

                    }


                    editingBookshelfData.items.splice(
                        index,
                        1
                    );


                    renderBookshelfItems();

                }
            );


            actions.appendChild(
                number
            );


            actions.appendChild(
                removeButton
            );


            card.appendChild(
                grid
            );


            card.appendChild(
                actions
            );


            bookshelfItemsContainer.appendChild(
                card
            );

        }

    );

}


// ==========================================
// ADD BOOK / PRODUCT
// ==========================================

function addBookshelfItem() {

    if (!editingBookshelfData) {
        return;
    }


    editingBookshelfData.items.push({

        id:
            Date.now() +
            Math.random(),

        name:
            "",

        image:
            "",

        description:
            ""

    });


    renderBookshelfItems();


    // Cuộn xuống cuối danh sách

    if (
        bookshelfItemsContainer
    ) {

        setTimeout(
            () => {

                bookshelfItemsContainer.scrollTop =
                    bookshelfItemsContainer.scrollHeight;

            },
            50
        );

    }

}


// ==========================================
// SAVE BOOKSHELF INFORMATION
// ==========================================

function saveBookshelfInformation() {

    if (
        !selectedBookshelf ||
        !editingBookshelfData
    ) {

        return;

    }


    let name =
        bookshelfNameInput
            ? bookshelfNameInput.value.trim()
            : "";


    if (!name) {

        name =
            "Tủ sách";

    }


    selectedBookshelf.bookshelfData = {

        name:
            name,

        items:
            editingBookshelfData.items.map(
                item => ({

                    id:
                        item.id,

                    name:
                        item.name.trim(),

                    image:
                        item.image || "",

                    description:
                        item.description.trim()

                })
            )

    };


    selectedBookshelf.setCoords();


    canvas.requestRenderAll();


    // Lưu ngay dữ liệu vào floor

    saveCurrentFloorState();


    closeBookshelfModal();

}


// ==========================================
// BOOKSHELF MODAL EVENTS
// ==========================================

if (bookshelfAddItemBtn) {

    bookshelfAddItemBtn.addEventListener(
        "click",
        addBookshelfItem
    );

}


if (bookshelfSaveBtn) {

    bookshelfSaveBtn.addEventListener(
        "click",
        saveBookshelfInformation
    );

}


if (bookshelfCloseBtn) {

    bookshelfCloseBtn.addEventListener(
        "click",
        closeBookshelfModal
    );

}


if (bookshelfCancelBtn) {

    bookshelfCancelBtn.addEventListener(
        "click",
        closeBookshelfModal
    );

}


// Click ra ngoài modal để đóng

if (bookshelfModalOverlay) {

    bookshelfModalOverlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                bookshelfModalOverlay
            ) {

                closeBookshelfModal();

            }

        }
    );

}


// ==========================================
// ESC ĐỂ ĐÓNG MODAL
// ==========================================

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            bookshelfModalOverlay &&
            bookshelfModalOverlay.classList.contains(
                "show"
            )
        ) {

            closeBookshelfModal();

        }

    }
);


// ==========================================
// RIGHT CLICK VÀO TỦ SÁCH
// ==========================================

// Fabric.js có một canvas phía trên
// dùng để nhận thao tác chuột.
// Ta bắt trực tiếp sự kiện contextmenu
// ở đây để chuột phải hoạt động ổn định.

if (canvas.upperCanvasEl) {

    canvas.upperCanvasEl.addEventListener(
        "contextmenu",
        function (event) {

            const target =
                canvas.findTarget(event);


            console.log(
                "CHUOT PHAI:",
                target
            );


            if (!target) {
                return;
            }


            console.log(
                "OBJECT TYPE:",
                target.objectType
            );


            if (
                target.objectType !==
                "bookshelf"
            ) {

                return;

            }


            event.preventDefault();
            event.stopPropagation();


            canvas.setActiveObject(
                target
            );

            target.setCoords();

            canvas.requestRenderAll();

            openBookshelfModal(
                target
            );

        }
    );

}
// ==========================================
// DELETE OBJECT
// ==========================================

function deleteSelectedObject() {

    const activeObject =
        canvas.getActiveObject();


    if (!activeObject) {

        alert(
            "Hãy chọn một đồ vật trước."
        );

        return;

    }


    // Xóa cả thao tác thành một bước lịch sử duy nhất.
    historyRestoring = true;

    if (
        activeObject.type ===
        "activeSelection"
    ) {

        const objects =
            activeObject.getObjects();


        canvas.discardActiveObject();


        objects.forEach(
            object => {

                canvas.remove(
                    object
                );

            }
        );

    }

    else {

        canvas.remove(
            activeObject
        );

        canvas.discardActiveObject();

    }

    historyRestoring = false;
    recordHistory();
    canvas.requestRenderAll();

}


// ==========================================
// DELETE BUTTON
// ==========================================

if (deleteObjectBtn) {

    deleteObjectBtn.addEventListener(
        "click",
        deleteSelectedObject
    );

}


// ==========================================
// DELETE KEY
// ==========================================

document.addEventListener(
    "keydown",
    event => {

        // Không xóa khi đang nhập text

        const activeObject =
            canvas.getActiveObject();


        if (
            activeObject &&
            activeObject.type === "i-text" &&
            activeObject.isEditing
        ) {

            return;

        }


        const tag =
            document.activeElement
                ?.tagName;


        if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT"
        ) {

            return;

        }


        if (
            event.key === "Delete" ||
            event.key === "Backspace"
        ) {

            if (activeObject) {

                event.preventDefault();

                deleteSelectedObject();

            }

        }

    }
);


// ==========================================
// GROUP
// ==========================================

function groupSelectedObjects() {

    const activeObject =
        canvas.getActiveObject();


    if (!activeObject) {

        alert(
            "Hãy chọn ít nhất 2 đồ vật để nhóm."
        );

        return;

    }


    if (
        activeObject.type ===
        "group"
    ) {

        return;

    }


    if (
        activeObject.type !==
        "activeSelection"
    ) {

        alert(
            "Hãy chọn từ 2 đồ vật trở lên."
        );

        return;

    }


    const objects =
        activeObject.getObjects();


    if (
        objects.length < 2
    ) {

        alert(
            "Hãy chọn từ 2 đồ vật trở lên."
        );

        return;

    }


    const group =
        activeObject.toGroup();


    group.setCoords();


    canvas.setActiveObject(
        group
    );


    canvas.requestRenderAll();

}


// ==========================================
// UNGROUP
// ==========================================

function ungroupSelectedObject() {

    const activeObject =
        canvas.getActiveObject();


    if (!activeObject) {

        alert(
            "Hãy chọn một nhóm trước."
        );

        return;

    }


    if (
        activeObject.type !==
        "group"
    ) {

        alert(
            "Đối tượng này không phải là nhóm."
        );

        return;

    }


    const selection =
        activeObject.toActiveSelection();


    selection.setCoords();


    canvas.setActiveObject(
        selection
    );


    canvas.requestRenderAll();

}


// ==========================================
// COPY
// ==========================================

function copySelectedObjects() {

    const activeObject =
        canvas.getActiveObject();


    if (!activeObject) {
        return;
    }


    if (
        activeObject.type === "i-text" &&
        activeObject.isEditing
    ) {

        return;

    }


    activeObject.clone(
        cloned => {

            clipboardData =
                cloned;

        }
    );

}


// ==========================================
// PASTE
// ==========================================

function pasteCopiedObjects() {

    if (!clipboardData) {
        return;
    }


    clipboardData.clone(
        cloned => {

            cloned.set({

                left:
                    (cloned.left || 0) +
                    COPY_OFFSET,

                top:
                    (cloned.top || 0) +
                    COPY_OFFSET

            });


            if (
                cloned.type ===
                "activeSelection"
            ) {

                cloned.canvas =
                    canvas;


                cloned.forEachObject(
                    object => {

                        canvas.add(
                            object
                        );

                    }
                );


                canvas.setActiveObject(
                    cloned
                );

            }

            else {

                canvas.add(
                    cloned
                );


                canvas.setActiveObject(
                    cloned
                );

            }


            cloned.setCoords();


            canvas.requestRenderAll();

        }
    );

}


// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

document.addEventListener(
    "keydown",
    event => {

        const activeObject =
            canvas.getActiveObject();


        if (
            activeObject &&
            activeObject.type === "i-text" &&
            activeObject.isEditing
        ) {

            return;

        }


        const tag =
            document.activeElement
                ?.tagName;


        if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT"
        ) {

            return;

        }


        const ctrl =
            event.ctrlKey ||
            event.metaKey;


        if (!ctrl) {
            return;
        }


        const key =
            event.key.toLowerCase();

        // CTRL + Z
        if (!event.shiftKey && key === "z") {
            event.preventDefault();
            undo();
            return;
        }

        // CTRL + Y hoặc CTRL + SHIFT + Z
        if (key === "y" || (event.shiftKey && key === "z")) {
            event.preventDefault();
            redo();
            return;
        }


        // CTRL + SHIFT + G

        if (
            event.shiftKey &&
            key === "g"
        ) {

            event.preventDefault();

            ungroupSelectedObject();

            return;

        }


        // CTRL + G

        if (
            !event.shiftKey &&
            key === "g"
        ) {

            event.preventDefault();

            groupSelectedObjects();

            return;

        }


        // CTRL + C

        if (
            !event.shiftKey &&
            key === "c"
        ) {

            if (activeObject) {

                event.preventDefault();

                copySelectedObjects();

            }

            return;

        }


        // CTRL + V

        if (
            !event.shiftKey &&
            key === "v"
        ) {

            if (clipboardData) {

                event.preventDefault();

                pasteCopiedObjects();

            }

            return;

        }

    }
);


// ==========================================
// CLEAR BOARD
// ==========================================

if (clearBoardBtn) {

    clearBoardBtn.addEventListener(
        "click",
        () => {

            const confirmClear =
                confirm(
                    "Bạn có chắc muốn xóa toàn bộ đồ vật?"
                );


            if (!confirmClear) {
                return;
            }


            historyRestoring = true;
            canvas.clear();
            historyRestoring = false;

            canvas.backgroundColor =
                "#ffffff";
            recordHistory();


            canvas.requestRenderAll();

        }
    );

}


// ==========================================
// RESIZE BOARD
// ==========================================

if (resizeBoardBtn) {

    resizeBoardBtn.addEventListener(
        "click",
        () => {

            const width =
                Number(
                    boardWidthInput.value
                );


            const height =
                Number(
                    boardHeightInput.value
                );


            if (
                !Number.isFinite(width) ||
                !Number.isFinite(height) ||
                width < 300 ||
                height < 300
            ) {

                alert(
                    "Kích thước tối thiểu là 300 × 300."
                );

                return;

            }


            const floor =
                getCurrentFloor();


            if (!floor) {
                return;
            }


            saveCurrentFloorState();


            floor.width =
                width;


            floor.height =
                height;


            // Giữ nguyên zoom hiện tại

            applyZoom();


            canvas.requestRenderAll();

        }
    );

}


// ==========================================
// FONT FAMILY
// ==========================================

if (fontFamilySelect) {

    fontFamilySelect.addEventListener(
        "change",
        () => {

            const activeObject =
                canvas.getActiveObject();


            if (!activeObject) {
                return;
            }


            if (
                activeObject.type === "i-text" ||
                activeObject.type === "text" ||
                activeObject.type === "textbox"
            ) {

                activeObject.set(
                    "fontFamily",
                    fontFamilySelect.value
                );


                activeObject.setCoords();
                recordHistory();

                canvas.requestRenderAll();

            }

        }
    );

}


// ==========================================
// FONT SIZE
// ==========================================

if (fontSizeInput) {

    fontSizeInput.addEventListener(
        "change",
        () => {

            const activeObject =
                canvas.getActiveObject();


            if (!activeObject) {
                return;
            }


            if (
                activeObject.type === "i-text" ||
                activeObject.type === "text" ||
                activeObject.type === "textbox"
            ) {

                const size =
                    Number(
                        fontSizeInput.value
                    );


                if (
                    Number.isFinite(size) &&
                    size > 0
                ) {

                    activeObject.set(
                        "fontSize",
                        size
                    );


                    activeObject.setCoords();
                    recordHistory();

                    canvas.requestRenderAll();

                }

            }

        }
    );

}


// ==========================================
// UPDATE FONT CONTROLS
// ==========================================

canvas.on(
    "selection:created",
    updateFontControls
);


canvas.on(
    "selection:updated",
    updateFontControls
);


function updateFontControls() {

    const activeObject =
        canvas.getActiveObject();


    if (!activeObject) {
        return;
    }


    if (
        activeObject.type === "i-text" ||
        activeObject.type === "text" ||
        activeObject.type === "textbox"
    ) {

        if (fontFamilySelect) {

            fontFamilySelect.value =
                activeObject.fontFamily ||
                "Arial";

        }


        if (fontSizeInput) {

            fontSizeInput.value =
                activeObject.fontSize ||
                20;

        }

    }

}


// ==========================================
// SAVE PROJECT
// ==========================================

function saveProject() {

    // Cực kỳ quan trọng:
    // lưu dữ liệu tủ + object
    // của tầng hiện tại trước

    saveCurrentFloorState();


    const params =
        new URLSearchParams(
            window.location.search
        );


    const projectId =
        params.get("id");


    if (!projectId) {

        alert(
            "Không tìm thấy ID dự án!"
        );

        return;

    }


    const projectName =
        projectNameInput
            ? projectNameInput.value.trim()
            : "";


    const projectData = {

        version:
            3,

        floors:
            floors

    };


    fetch(
        `/api/projects/${projectId}`,
        {

            method:
                "PUT",

            headers:
                {
                    "Content-Type":
                        "application/json"
                },

            credentials:
                "include",

            body:
                JSON.stringify({

                    name:
                        projectName ||
                        "Bản đồ chưa đặt tên",

                    canvas_data:
                        JSON.stringify(
                            projectData
                        )

                })

        }
    )

    .then(
        response => {

            if (!response.ok) {

                throw new Error(
                    "HTTP " +
                    response.status
                );

            }


            return response.json();

        }
    )

    .then(
        data => {

            if (
                data.success
            ) {

                alert(
                    "Lưu dự án thành công!"
                );

            }

            else {

                alert(
                    data.message ||
                    "Không thể lưu dự án!"
                );

            }

        }
    )

    .catch(
        error => {

            console.error(
                error
            );


            alert(
                "Không thể kết nối tới server!"
            );

        }
    );

}


// ==========================================
// SAVE BUTTON
// ==========================================

if (saveProjectBtn) {

    saveProjectBtn.addEventListener(
        "click",
        saveProject
    );

}


// ==========================================
// INITIALIZE
// ==========================================

renderFloorList();


loadFloor(
    currentFloorId
);


updateZoomDisplay();