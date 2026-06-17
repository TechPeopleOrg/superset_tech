function generateRandomHash(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function interpolateColor(color, percentage) {
    // Преобразуем hex в RGB
    const hexToRgb = hex => {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    };

    // Преобразуем RGB в hex
    const rgbToHex = (r, g, b) => {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    };

    const [r1, g1, b1] = hexToRgb('#ffffff');
    const [r2, g2, b2] = hexToRgb(color);

    const r = Math.round(r1 + (r2 - r1) * (percentage / 100));
    const g = Math.round(g1 + (g2 - g1) * (percentage / 100));
    const b = Math.round(b1 + (b2 - b1) * (percentage / 100));

    return rgbToHex(r, g, b);
}

class Controls {
    #containerNode;
    #svg;
    #core;  // Добавляем ссылку на основной класс
    
    constructor(containerNode, svg, core) {  // Добавляем параметр core
        this.#containerNode = containerNode;
        this.#svg = svg;
        this.#core = core;  // Сохраняем ссылку на основной класс
    }

    createBtn(text,callback) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding:0;
            width:20px;
            height:20px;
            line-height:18px;
            background:#ebebeb;
            border: 1px solid black;
            border-radius:
            2px;cursor:pointer;
        `;
        btn.addEventListener('click', callback);
        return btn;
    }

    useScaleControll() {
        const scaleBox = document.createElement('div');
        scaleBox.classList.add('scale_box');
        scaleBox.style.cssText = `
            position:absolute;
            top:0;
            right:0;
            display:flex;
            gap:2px;
            padding:2px;
            z-index:1000;
        `;
        const btnNegative = this.createBtn('-', () => {
            const currentScale = this.#core.scale;
            const newScale = Math.max(this.#core.minScale, currentScale - 0.1);
            this.#core.setScale(newScale);
            this.#core.centerView();
        });

        const btnPositive = this.createBtn('+', () => {
            const currentScale = this.#core.scale;
            const newScale = Math.min(this.#core.maxScale, currentScale + 0.1);
            this.#core.setScale(newScale);
            this.#core.centerView();
        });

        const btnReset = this.createBtn('↻', () => {
            this.#core.fitContainer();
        });
        
        scaleBox.append(btnNegative, btnPositive, btnReset);
        this.#containerNode.appendChild(scaleBox);
    }

    destroy() {
        // Метод для очистки при уничтожении
        const controls = this.#containerNode.querySelectorAll('[style*="position:absolute;top:0;right:0"]');
        controls.forEach(control => control.remove());
    }
}

class Events {

    registerEvents(svgNode,data) {
        const elements = svgNode.querySelectorAll('[name]');

        function formatter(value, callback) {
            if (typeof callback === 'function') {
                return callback(value);
            }
            return value
        }

        elements.forEach((node, index) => {
            let flag = true;
            if(data.events.hasOwnProperty('click')) {
                node.addEventListener('click', () => {
                    flag = true;
                    setTimeout(function () {
                        if(flag) {
                            const value = node.getAttribute('name');
                            formatter(value, data.events.click);
                        }
                    }, 300);
                });
            }
            if (data.events.hasOwnProperty('dblclick')) {
                node.addEventListener('dblclick', () => {
                    if(data.events.hasOwnProperty('click')) {
                        flag = false;
                    }
                    const value = node.getAttribute('name');
                    formatter(value, data.events.dblclick);
                });
            }
        });
    }
}

class LabelText {
    constructor(svg) {
        this.svg = svg;
    }

    setOptions(data,textNode) {
        let options = {
            show: true,
            fontSize: 14,
            fontFamily: false,
            color: 'black'
        };
        if (data.label.hasOwnProperty('fontSize')) {
            if (typeof data.label.fontSize === 'number') {
                options.fontSize = data.label.fontSize;
            }
        }
        if (data.label.hasOwnProperty('fontFamily')) {
            if (typeof data.label.fontFamily === 'string') {
                options.fontFamily = data.label.fontFamily;
            }
        }
        if (data.label.hasOwnProperty('color')) {
            if (typeof data.label.color === 'string') {
                options.color = data.label.color;
            }
        }
        if (data.label.hasOwnProperty('className')) {
            textNode.classList.add(data.label.className);
        }
        if (data.label.hasOwnProperty('show')) {
            if (data.label.show === true) {
                textNode.style.visibility = 'visible';
            } else if (data.label.show === false) {
                textNode.style.visibility = 'hidden';
            }
        }
        return options;
    }

    addLabelText(data) {

        function formatter(input, callback) {
            if (typeof callback === 'function') {
                const result = callback(input);
                if (typeof result === 'string') {
                    return result;
                }
            }
            return input
        }

        const originalTextNodes = this.svg.querySelectorAll('text');
        if (originalTextNodes.length) {
            originalTextNodes.forEach(textNode => {
                textNode.remove();
            });
        }
        const originalTitleNodes = this.svg.querySelectorAll('title');
        if (originalTitleNodes.length) {
            originalTitleNodes.forEach(textNode => {
                textNode.remove();
            });
        }
        const elements = this.svg.querySelectorAll('[name]');
        elements.forEach(node => {            
            let val = 0;
            if(data.hasOwnProperty('data')) {
                const obj = data.data.find(el => el.name === node.getAttribute('name'));
                if(obj) {
                    val = obj.value;
                }
            }
            let bbox = node.getBBox();
            let x = bbox.x + bbox.width / 2;
            let y = bbox.y + bbox.height / 2;
            let textElem = document.createElementNS(node.namespaceURI, 'text');
            const options = this.setOptions(data, textElem);
            textElem.setAttribute('x', x);
            textElem.setAttribute('y', y);
            textElem.setAttribute('text-anchor', "middle");
            textElem.setAttribute('dominant-baseline', "middle");
            textElem.setAttribute('font-size', `${options.fontSize}px`);
            textElem.setAttribute('font-family', options.fontFamily || null);
            textElem.style.fill = options.color;
            if(val !== null && val !== undefined) {
                if (data.label.hasOwnProperty('formatter')) {
                    textElem.textContent = formatter(val, data.label.formatter);
                } else {
                    textElem.textContent = val;
                }
            }
            node.after(textElem);
        });
    }
}

class TooltipElement {
    constructor(containerNode) {
        this.tooltip = this.createTooltip(containerNode);
    }

    createTooltip(containerNode) {
        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            display: none;
            position: absolute;
            padding: 5px;
            z-index: 1000;
            transform: translateZ(0);
            transition: opacity 0.4s ease, visibility 0.4s ease;
            opacity: 0;
            visibility: hidden;
        `;
        containerNode.appendChild(tooltip);
        return tooltip;
    }

    setOptions(data) {
        let options = {
            show: true,
            offset: 25,
            positionAuto: false,
            fontSize: 14,
            fontFamily: false,
            background: false,
            color: false,
            border: false,
            borderRadius: 0,
            padding: 0
        };
        if (data.tooltip.hasOwnProperty('position')) {
            if (data.tooltip.position === 'bottom') {
                options.offset = 25;
            } else if (data.tooltip.position === 'top') {
                options.offset = -this.tooltip.clientHeight;
            }
        }
        if (data.tooltip.hasOwnProperty('positionAuto') && data.tooltip.positionAuto) {
            options.positionAuto = true;
        }
        if (data.tooltip.hasOwnProperty('fontSize')) {
            if (typeof data.tooltip.fontSize === 'number') {
                options.fontSize = data.tooltip.fontSize;
            }
        }
        if (data.tooltip.hasOwnProperty('fontFamily')) {
            if (typeof data.tooltip.fontFamily === 'string') {
                options.fontFamily = data.tooltip.fontFamily;
            }
        }
        if (data.tooltip.hasOwnProperty('padding')) {
            if (typeof data.tooltip.padding === 'number') {
                options.padding = data.tooltip.padding;
            }
        }
        if (data.tooltip.hasOwnProperty('background')) {
            options.background = true;
        }
        if (data.tooltip.hasOwnProperty('color')) {
            options.color = true;
        }
        if (data.tooltip.hasOwnProperty('borderColor')) {
            options.border = true;
        }
        if (data.tooltip.hasOwnProperty('borderRadius')) {
            if (typeof data.tooltip.borderRadius === 'number') {
                options.borderRadius = data.tooltip.borderRadius;
            }

        }
        if (data.tooltip.hasOwnProperty('className')) {
            this.tooltip.classList.add(data.tooltip.className);
        }
        if(data.tooltip.hasOwnProperty('show')) {
            if (data.tooltip.show === true) {
                this.tooltip.style.visibility = 'visible';
            } else if (data.tooltip.show === false) {
                this.tooltip.style.visibility = 'hidden';
            }
        }
        return options;
    }

    setEventByName(svgNode,data) {
        const elements = svgNode.querySelectorAll('[name]');

        function formatter(input, callback) {
            if (typeof callback === 'function') {
                const result = callback(input);
                if (typeof result === 'string') {
                    return result;
                }
            }
            return input
        }

        const setAutoPosition = (x,y) => {
            const tooltipWidth = this.tooltip.offsetWidth;
            const tooltipHeight = this.tooltip.offsetHeight;
            const container = this.tooltip.parentElement;
    
            // Горизонтальное позиционирование
            if (x + tooltipWidth + 15 > container.clientWidth) {
                this.tooltip.style.left = `${x - tooltipWidth - 10}px`;
            } else {
                this.tooltip.style.left = `${x + 15}px`;
            }
    
            // Вертикальное позиционирование
            if (y + tooltipHeight + 15 > container.clientHeight) {
                this.tooltip.style.top = `${y - tooltipHeight - 10}px`;
            } else {
                this.tooltip.style.top = `${y + 15}px`;
            }
        };

        elements.forEach((node, index) => {
            let series = [];
            if(data.hasOwnProperty('data')) {
                series = data.data;
            }
            const obj = series.find(el => el.name === node.getAttribute('name'));
            node.addEventListener('mousemove', (e) => {
                if(obj) {
                    this.tooltip.style.display = "block";
                    this.tooltip.style.opacity = "1";
                    this.tooltip.style.visibility = "visible";
                    node.style.opacity = 0.5;
                    node.style.cursor = 'pointer';
                } else {
                    this.tooltip.style.opacity = "0";
                    this.tooltip.style.visibility = "hidden";
                }
                const options = this.setOptions(data);
                if(options.positionAuto) {
                    setAutoPosition(e.offsetX, e.offsetY);
                } else {
                    this.tooltip.style.left = e.offsetX + 15 + 'px';
                    this.tooltip.style.top = e.offsetY + options.offset + 'px';
                }
                if (data.tooltip.hasOwnProperty('formatter')) {
                    this.tooltip.innerHTML = formatter(node.getAttribute('name'),data.tooltip.formatter);
                } else {
                    this.tooltip.innerHTML = node.getAttribute('name');
                }
                this.tooltip.style.fontSize = options.fontSize + 'px';
                this.tooltip.style.fontFamily = options.fontFamily ? options.fontFamily : null;
                this.tooltip.style.padding = options.padding + 'px';

                this.tooltip.style.background = options.background ?
                data.tooltip.background : window.getComputedStyle(node).fill;

                this.tooltip.style.border = options.border ? 
                `1px solid ${data.tooltip.borderColor}` : `1px solid ${window.getComputedStyle(node).fill}`;

                this.tooltip.style.borderRadius = `${options.borderRadius}px`;

                this.tooltip.style.color = options.color ? data.tooltip.color : window.getComputedStyle(node).fill;

            });
            node.addEventListener('mouseleave', () => {
                node.style.opacity = 1;
                this.tooltip.style.opacity = "0";
                this.tooltip.style.visibility = "hidden";
            });
        });
    }
}

class SVGCore {
    constructor(containerNode, strSVG) {
        this.containerNode = containerNode;
        this.svg = this.createSVG(strSVG);
        this.tooltip = new TooltipElement(containerNode);
        this.labelText = new LabelText(this.svg);
        this.events = new Events();

        // Pan & Zoom variables
        this.scale = 1;
        this.minScale = 0.1;
        this.maxScale = 10;
        this.translateX = 0;
        this.translateY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.originalViewBox = this.parseOriginalViewBox();

        this.initSize();
        this.setupEventListeners();

        // Initialize controls
        this.controls = new Controls(this.containerNode, this.svg, this);
        this.controls.useScaleControll();
    }

    createSVG(strSVG) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(strSVG.trim(), 'image/svg+xml');
        const svg = svgDoc.documentElement;
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const randomHash = generateRandomHash(8);
        svg.classList.add(`chart_instance_${randomHash}`);
        
        this.containerNode.style.position = 'relative';
        this.containerNode.style.overflow = 'hidden';
        this.containerNode.style.userSelect = 'none';
        this.containerNode.appendChild(svg);
        return svg;
    }

    parseOriginalViewBox() {
        const viewBox = this.svg.getAttribute('viewBox');
        if (viewBox) {
            return viewBox.split(' ').map(Number);
        }
        
        const width = this.svg.width.baseVal.value;
        const height = this.svg.height.baseVal.value;
        return [0, 0, width, height];
    }

    initSize() {
        const containerWidth = this.containerNode.clientWidth;
        const containerHeight = this.containerNode.clientHeight;
        
        this.svg.setAttribute('width', '100%');
        this.svg.setAttribute('height', '100%');
        
        // Calculate initial scale to fit container
        const [,, vbWidth, vbHeight] = this.originalViewBox;
        const scaleX = containerWidth / vbWidth;
        const scaleY = containerHeight / vbHeight;
        this.scale = Math.min(scaleX, scaleY);
        
        this.centerView();
    }

    resetView() {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.updateViewBox();
    }

    fitContainer() {
        const containerWidth = this.containerNode.clientWidth;
        const containerHeight = this.containerNode.clientHeight;
        const [,, vbWidth, vbHeight] = this.originalViewBox;
        
        const scaleX = containerWidth / vbWidth;
        const scaleY = containerHeight / vbHeight;
        this.scale = Math.min(scaleX, scaleY);
        
        this.centerView();
    }

    centerView() {
        const containerWidth = this.containerNode.clientWidth;
        const containerHeight = this.containerNode.clientHeight;
        const [,, vbWidth, vbHeight] = this.originalViewBox;
        
        // Calculate translation to center the view
        this.translateX = -(containerWidth / this.scale - vbWidth) / 2;
        this.translateY = -(containerHeight / this.scale - vbHeight) / 2;
        
        this.updateViewBox();
    }

    updateViewBox() {
        const containerWidth = this.containerNode.clientWidth;
        const containerHeight = this.containerNode.clientHeight;
        
        const viewBoxWidth = containerWidth / this.scale;
        const viewBoxHeight = containerHeight / this.scale;
        
        this.svg.setAttribute('viewBox', 
            `${this.translateX} ${this.translateY} ${viewBoxWidth} ${viewBoxHeight}`);
    }

    setupEventListeners() {
        this.handleResize = this.handleResize.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleWheel = this.handleWheel.bind(this);

        window.addEventListener('resize', this.handleResize);
        this.svg.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        this.svg.addEventListener('mouseleave', this.handleMouseLeave);
        this.svg.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    handleResize() {
        this.updateViewBox();
        this.initSize();
    }

    handleMouseDown(e) {
        if (e.button === 0) {
            this.isPanning = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.svg.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            const dx = (e.clientX - this.lastMouseX) / this.scale;
            const dy = (e.clientY - this.lastMouseY) / this.scale;
            
            this.translateX -= dx;
            this.translateY -= dy;
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            
            this.updateViewBox();
            e.preventDefault();
        }
    }

    handleMouseUp() {
        this.isPanning = false;
        this.svg.style.cursor = 'grab';
    }

    handleMouseLeave() {
        if (this.isPanning) {
            this.isPanning = false;
            this.svg.style.cursor = 'grab';
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * (1 + delta)));
        
        // Get mouse position relative to SVG
        const rect = this.svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate mouse position in viewBox coordinates
        const viewBoxX = this.translateX + (mouseX / rect.width) * (rect.width / this.scale);
        const viewBoxY = this.translateY + (mouseY / rect.height) * (rect.height / this.scale);
        
        // Update scale
        this.scale = newScale;
        
        // Adjust translation to zoom toward mouse position
        this.translateX = viewBoxX - (mouseX / rect.width) * (rect.width / this.scale);
        this.translateY = viewBoxY - (mouseY / rect.height) * (rect.height / this.scale);
        
        this.updateViewBox();
    }

    setScale(newScale) {
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        this.updateViewBox();
    }

    getClassSVG() {
        return this.svg.getAttribute('class');
    }

    useColorRange(svgNode, data) {
        const elements = svgNode.querySelectorAll('[name]');
        elements.forEach((node) => {
            let val = 0;
            if (data.hasOwnProperty('data')) {
                const obj = data.data.find(el => el.name === node.getAttribute('name'));
                if (obj) {
                    val = obj.value;
                }
            }
            node.style.fill = interpolateColor(data.colorRange || '#8431c5', val);
        });
    }

    useColorStatus(svgNode, data) {
        const elements = svgNode.querySelectorAll('[name]');
        elements.forEach((node) => {
            if (data.hasOwnProperty('data') && data.hasOwnProperty('colorStatus')) {
                const objData = data.data.find(el => el.name === node.getAttribute('name'));
                if (objData) {
                    const objColor = data.colorStatus.find(el => el.status === objData.status);
                    if (objData && objColor) {
                        node.style.fill = objColor.color;
                    }
                }
            }
        });
    }

    setOption(data) {
        if (data.hasOwnProperty('tooltip')) {
            this.tooltip.setEventByName(this.svg, data);
        }
        if (data.hasOwnProperty('label')) {
            this.labelText.addLabelText(data);
        }
        if (data.type === 'range') {
            this.useColorRange(this.svg, data);
        }
        if (data.type === 'status') {
            this.useColorStatus(this.svg, data);
        }
        if (data.hasOwnProperty('events')) {
            this.events.registerEvents(this.svg, data);
        }
    }

    destroy() {
        window.removeEventListener('resize', this.handleResize);
        this.svg.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        this.svg.removeEventListener('mouseleave', this.handleMouseLeave);
        this.svg.removeEventListener('wheel', this.handleWheel);
        
        if (this.controls && this.controls.destroy) {
            this.controls.destroy();
        }
    }
}

export { SVGCore as default };
