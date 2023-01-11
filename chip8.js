// rendering
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const columns = 128;
const rows = 64;
const scale = 8;

let display = new Array(columns * rows);
const setPixel = (x, y) => {
    // wrap around 
    if (x > columns) {
        x -= columns;
    } else if (x < 0) {
        x += columns;
    }
    if (y > rows) {
        y -= rows;
    } else if (y < 0) {
        y += rows;
    }
    let pixel = x + (y * columns);
    
    // flip
    display[pixel] ^= 1;
    return !display[pixel];
}

const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let px=0; px<columns*rows; px++) {
        if (display[px]) {
            let x = (px % columns) * scale;
            let y = Math.floor(px / columns) * scale;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x, y, scale, scale);
        }
    }
}

// input
let keysPressed = [];
let onNextKeyPress = null;
const keyMap = {
    49: 0x1, // 1
    50: 0x2, // 2
    51: 0x3, // 3
    52: 0xc, // 4
    81: 0x4, // Q
    87: 0x5, // W
    69: 0x6, // E
    82: 0xD, // R
    65: 0x7, // A
    83: 0x8, // S
    68: 0x9, // D
    70: 0xE, // F
    90: 0xA, // Z
    88: 0x0, // X
    67: 0xB, // C
    86: 0xF  // V
}

const isKeyPressed = keyCode => {
    return keysPressed[keyCode];
}

const onKeyDown = event => {
    let key = keyMap[event.which];
    keysPressed[key] = true;

    if (onNextKeyPress !== null && key) {
        onNextKeyPress(parseInt(key));
        onNextKeyPress = null;
    }
}

const onKeyUp = event => {
    let key = keyMap[event.which];
    keysPressed[key] = false;
}

// cpu
let memory = new Uint8Array(4096);
let registers = new Uint8Array(16);
let stack = [];
let instruction = 0;
let counter = 0x200;
let paused = false;

// timers
let delayTimer = 0;
let soundTimer = 0;

// audio
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let audioGain = null;
let oscillator = null;

// chip8
const loadRomIntoMemory = array => {
    for (let x=0; x<array.length; x++) {
        memory[counter + x] = array[x];
    }
}

const loadSpritesIntoMemory = () => {
    const sprites = [
        0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
        0x20, 0x60, 0x20, 0x20, 0x70, // 1
        0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
        0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
        0x90, 0x90, 0xF0, 0x10, 0x10, // 4
        0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
        0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
        0xF0, 0x10, 0x20, 0x40, 0x40, // 7
        0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
        0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
        0xF0, 0x90, 0xF0, 0x90, 0x90, // A
        0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
        0xF0, 0x80, 0x80, 0x80, 0xF0, // C
        0xE0, 0x90, 0x90, 0x90, 0xE0, // D
        0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
        0xF0, 0x80, 0xF0, 0x80, 0x80  // F
    ];

    for (let x=0; x<sprites.length; x++) {
        memory[x] = sprites[x];
    }
}

const updateTimers = () => {
    if (delayTimer > 0) {
        delayTimer -= 1;
    }
    if (soundTimer > 0) {
        soundTimer -= 1;
    }
}

const cycle = () => {
    for (let x=0; x<10; x++) {
        if (!paused) {
            let opcode = memory[counter] << 8 | memory[counter + 1];
            execute(opcode);
        }
    }
    if (!paused) {
        updateTimers();
    }

    if (soundTimer > 0) {
      if (audioCtx == null) {
        audioCtx = new AudioContext();
        audioGain = audioCtx.createGain();
        audioGain.connect(audioCtx.destination);
      }
      if (audioCtx != null && oscillator == null) {
        oscillator = audioCtx.createOscillator();
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.type = 'square';
        oscillator.connect(audioGain);
        oscillator.start();
      }
    }
    else {
      if (oscillator != null) {
        oscillator.stop();
        oscillator.disconnect();
        oscillator = null;
      }
    }
}

const execute = opcode => {
    /* 
        nnn or addr - A 12-bit value, the lowest 12 bits of the instruction
        n or nibble - A 4-bit value, the lowest 4 bits of the instruction
        x - A 4-bit value, the lower 4 bits of the high byte of the instruction
        y - A 4-bit value, the upper 4 bits of the low byte of the instruction
        kk or byte - An 8-bit value, the lowest 8 bits of the instruction
    */ 
    counter += 2;

    let x = (opcode & 0x0F00) >> 8;
    let y = (opcode & 0x00F0) >> 4;
    switch (opcode & 0xF000) {
        case 0x0000:
            switch (opcode) {
                case 0x00E0: 
                    display = new Array(columns * rows);
                    break;
                case 0x00EE:
                    counter = stack.pop();
                    break;
            }
            break;

        case 0x1000:
            counter = (opcode & 0xFFF);
            break;
        case 0x2000:
            stack.push(counter);
            counter = (opcode & 0xFFF);
            break;
        case 0x3000:
            if (registers[x] === (opcode & 0xFF)) {
                counter += 2;
            }
            break;
        case 0x4000:
            if (registers[x] !== (opcode & 0xFF)) {
                counter += 2;
            }
            break;
        case 0x5000:
            if (registers[x] === registers[y]) {
                counter += 2;
            }
            break;
        case 0x6000:
            registers[x] = (opcode & 0xFF);
            break;
        case 0x7000:
            registers[x] += (opcode & 0xFF);
            break;

        case 0x8000:
            switch (opcode & 0xF) {
                case 0x0: 
                    registers[x] = registers[y];
                    break;
                case 0x1:
                    registers[x] |= registers[y]; 
                    break;
                case 0x2:
                    registers[x] &= registers[y];
                    break;
                case 0x3:
                    registers[x] ^= registers[y];
                    break;
                case 0x4:
                    const sum = registers[x] + registers[y];
                    registers[0xF] = 0;
                    if (sum > 0xFF) {
                        registers[0xF] = 1;
                    }
                    registers[x] = sum;
                    break;
                case 0x5:
                    registers[0xF] = 0;
                    if (registers[x] > registers[y]) {
                        registers[0xF] = 1;
                    }
                    registers[x] -= registers[y];
                    break;
                case 0x6:
                    registers[0xF] = (registers[x] & 0x1);
                    registers[x] >>= 1;
                    break;
                case 0x7:
                    registers[0xF] = 0
                    if (registers[y] > registers[x]) {
                        registers[0xF] = 1;
                    }
                    registers[x] = registers[y] - registers[x];
                    break;
                case 0xE:
                    registers[0xF] = (registers[x] & 0x80);
                    registers[x] <<= 1;
                    break;
            }
            break;

        case 0x9000:
            if (registers[x] !== registers[y]) {
                counter += 2;
            }
            break;
        case 0xA000:
            instruction = (opcode & 0xFFF);
            break;
        case 0xB000:
            counter = (opcode & 0xFFF) + registers[0];
            break;
        case 0xC000:
            registers[x] = Math.floor(Math.random() * 0xFF) & (opcode & 0xFF);
            break;
        case 0xD000:
            const height = (opcode & 0xF);
            registers[0xF] = 0;
            for (let row=0; row<height; row++) {
                let spritePx = memory[instruction + row];
                for (let column=0; column<8; column++) {
                    if ((spritePx & 0x80) > 0) {
                        if (setPixel(registers[x] + column, registers[y] + row)) {
                            // display pixel was flipped
                            registers[0xF] = 1;
                        }
                    }
                    spritePx <<= 1;
                }
            }
            break;

        case 0xE000: 
            switch (opcode & 0xFF) {
                case 0x9E:
                    if (isKeyPressed([registers[x]])) {
                        counter += 2;
                    }
                    break;
                case 0xA1:
                    if (!isKeyPressed([registers[x]])) {
                        counter += 2;
                    }
                    break;
            }
            break;

        case 0xF000:
            switch (opcode & 0xFF) {
                case 0x07:
                    registers[x] = delayTimer;
                    break;
                case 0x0A:
                    paused = true;
                    onNextKeyPress = key => {
                        registers[x] = key;
                        paused = false;
                    }
                    break;
                case 0x15:
                    delayTimer = registers[x];
                    break;
                case 0x18:
                    soundTimer = registers[x];
                    break;
                case 0x1E:
                    instruction += registers[x];
                    break;
                case 0x29:
                    instruction = registers[x] * 5;
                    break;
                case 0x33:
                    memory[instruction] = parseInt(registers[x] / 100);
                    memory[instruction + 1] = parseInt((registers[x] % 100)/ 10);
                    memory[instruction + 2] = parseInt(registers[x] % 10);
                    break;
                case 0x55:
                    for (let idx=0; idx<=x; idx++) {
                        memory[instruction + idx] = registers[idx];
                    }
                    break;
                case 0x65:
                    for (let idx=0; idx<=x; idx++) {
                        registers[idx] = memory[instruction + idx];
                    }
                    break;
            }
            break;
        default:
            console.log(`Unknown opcode: 0x${opcode.toString(16)}`);
    }
}

const start = () => {
    const fps = 60;

    let lastFrame = Date.now();
    let loop = () => {
        const now = Date.now();
        if (now - lastFrame > 1000 / fps) {
            cycle();
            render();
            lastFrame = Date.now();
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

window.addEventListener('keydown', onKeyDown, false);
window.addEventListener('keyup', onKeyUp, false);

const addOptionToSelect = (select, value)  => {
    let option = document.createElement('option');
    option.value = value;
    option.innerHTML = value;
    option.onclick = e => {
      run(e.target.innerHTML);
    }
    select.appendChild(option);
}

const makeKeypad  = () => {
    const table = document.createElement('table');
    let tr = document.createElement('tr');
    let count = 0;
    for (let key of Object.keys(keyMap)) {
        let td = document.createElement('td');
        td.innerHTML = String.fromCharCode(key);
        td.classList.add('keypad-button');
        td.addEventListener('click', () => onKeyDown({ which: parseInt(key) }));
        tr.appendChild(td);
        count++;
        if (count % 4 == 0) {
            table.appendChild(tr);
            tr = document.createElement('tr');
        }
    }
    document.getElementById('keypad').appendChild(table);

    const select = document.createElement('select');
    
    addOptionToSelect(select, 'BLINKY')
    addOptionToSelect(select, 'PONG')
    addOptionToSelect(select, 'MAZE')
    addOptionToSelect(select, 'MISSILE')
    addOptionToSelect(select, 'TANK')
    addOptionToSelect(select, 'UFO')
    addOptionToSelect(select, 'TETRIS')
    addOptionToSelect(select, 'BLITZ')
    addOptionToSelect(select, 'CONNECT4')
    addOptionToSelect(select, 'INVADERS')
    addOptionToSelect(select, 'test_opcode.ch8')

    document.getElementById('keypad').appendChild(select);

}

const run = rom => {
    // reset everything
    display = new Array(columns * rows);

    memory = new Uint8Array(4096);
    registers = new Uint8Array(16);

    stack = [];
    instruction = 0;
    counter = 0x200;
    paused = false;

    keysPressed = [];
    onNextKeyPress = null;
  
    delayTimer = 0;
    soundTimer = 0;

    oscillator = null;

    fetch(`roms/${rom}`)
        .then(r => {
            return r.arrayBuffer();
        })
    .then(arr => {
        loadSpritesIntoMemory();
        const rom = new Uint8Array(arr);
        loadRomIntoMemory(rom);
    }).then(() => {
        start();
    });
}

window.onload = () => {
    canvas.width = columns * scale;
    canvas.height = rows * scale;
    makeKeypad();
}

