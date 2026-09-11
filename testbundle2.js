/*!
 * Phar Lap 2 — Copyright 2026 sun-dive — Business Source License 1.1 (see LICENSE).
 * Converts to the Apache License 2.0 on 2030-09-09.
 *
 * Includes @noble/hashes 2.4.0 — Copyright (c) 2022 Paul Miller (https://paulmillr.com)
 * Licensed under the MIT License. Full text: https://github.com/paulmillr/noble-hashes/blob/main/LICENSE
 */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

  // node_modules/@noble/hashes/_u64.js
  var U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
  var _32n = /* @__PURE__ */ BigInt(32);
  function fromBig(n, le = false) {
    if (le)
      return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
    return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
  }
  function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const { h, l } = fromBig(lst[i], le);
      [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
  }
  var fromNumH = (n) => n / 2 ** 32 | 0;
  var fromNumL = (n) => n >>> 0;
  function setU64FromNum(view, byteOffset, n, isLE) {
    const h = fromNumH(n);
    const l = fromNumL(n);
    view.setUint32(byteOffset, isLE ? l : h, isLE);
    view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
  }
  var shrSH = (h, _l, s) => h >>> s;
  var shrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
  var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
  var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
  function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
  }
  var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
  var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
  var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
  var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
  var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
  var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

  // node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  var atitle = (title) => title ? `"${title}" ` : "";
  function anumber(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes(value, length, title = "") {
    if (isBytes(value) && (length === void 0 || value.length === length))
      return value;
    if (length !== void 0)
      anumber(length, "length");
    const bytes = isBytes(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new TypeError("expected hash wrapped by utils.createHasher");
    anumber(h.outputLen);
    anumber(h.blockLen);
    if (h.outputLen < 1 || h.blockLen < 1)
      throw new Error("hash blockLen / outputLen must be >= 1");
  }
  var aobject = (value, label) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
  };
  var aopts = (value, label) => {
    aobject(value, label);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError(`"${label}" expected plain object`);
    if (Object.hasOwn(value, "__proto__"))
      throw new TypeError(`"${label}.__proto__" is not allowed`);
  };
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr2) {
    return new DataView(arr2.buffer, arr2.byteOffset, arr2.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  function rotl(word, shift) {
    return word << shift | word >>> 32 - shift >>> 0;
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new TypeError("string expected");
    const encoded = new TextEncoder().encode(str);
    try {
      return new Uint8Array(encoded);
    } finally {
      clean(encoded);
    }
  }
  function kdfInputToBytes(data, errorTitle = "") {
    if (typeof data === "string")
      return utf8ToBytes(data);
    return abytes(data, void 0, errorTitle);
  }
  function checkOpts(defaults, opts, title = "opts") {
    aopts(defaults, "defaults");
    if (opts !== void 0)
      aopts(opts, title);
    const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== "function")
      throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, "info");
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  var oidNist = (suffix) => ({
    // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
    // Larger suffix values would need base-128 OID encoding and a different length byte.
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // node_modules/@noble/hashes/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class {
    constructor(blockLen, outputLen, padOffset, isLE) {
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "canXOF", false);
      __publicField(this, "padOffset");
      __publicField(this, "isLE");
      // For partial updates less than block size
      __publicField(this, "buffer");
      __publicField(this, "view");
      __publicField(this, "finished", false);
      __publicField(this, "length", 0);
      __publicField(this, "pos", 0);
      __publicField(this, "destroyed", false);
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      let processed = false;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          processed = true;
          continue;
        }
        buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
          processed = true;
        }
      }
      this.length += data.length;
      if (processed)
        this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      buffer.fill(0, pos);
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        buffer.fill(0);
      }
      setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
      this.process(view, 0);
      this.roundClean();
      const oview = out === buffer ? view : createView(out);
      const len = this.outputLen;
      const outLen = len / 4;
      const state = this.get();
      if (len % 4 || outLen > state.length)
        throw new Error("invalid outputLen");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneIntoMeta(to) {
      const { buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (pos)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    4089235720,
    3144134277,
    2227873595,
    1013904242,
    4271175723,
    2773480762,
    1595750129,
    1359893119,
    2917565137,
    2600822924,
    725511199,
    528734635,
    4215389547,
    1541459225,
    327033209
  ]);

  // node_modules/@noble/hashes/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA2_32B = class extends HashMD {
    constructor(outputLen, IV) {
      super(64, outputLen, 8, false);
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and makes sha256 3x slower (measured).
      __publicField(this, "A", 0);
      __publicField(this, "B", 0);
      __publicField(this, "C", 0);
      __publicField(this, "D", 0);
      __publicField(this, "E", 0);
      __publicField(this, "F", 0);
      __publicField(this, "G", 0);
      __publicField(this, "H", 0);
      this.A = IV[0] | 0;
      this.B = IV[1] | 0;
      this.C = IV[2] | 0;
      this.D = IV[3] | 0;
      this.E = IV[4] | 0;
      this.F = IV[5] | 0;
      this.G = IV[6] | 0;
      this.H = IV[7] | 0;
    }
    get() {
      const { A, B, C, D, E, F, G: G2, H } = this;
      return [A, B, C, D, E, F, G2, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G2, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G2 | 0;
      this.H = H | 0;
    }
    _cloneInto(to) {
      (to || (to = new this.constructor())).set(...this.get());
      return this._cloneIntoMeta(to);
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G: G2, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G2;
        G2 = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G2 = G2 + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G2, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.destroyed = true;
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var _SHA256 = class extends SHA2_32B {
    constructor() {
      super(32, SHA256_IV);
    }
  };
  var K512 = /* @__PURE__ */ (() => split([
    "0x428a2f98d728ae22",
    "0x7137449123ef65cd",
    "0xb5c0fbcfec4d3b2f",
    "0xe9b5dba58189dbbc",
    "0x3956c25bf348b538",
    "0x59f111f1b605d019",
    "0x923f82a4af194f9b",
    "0xab1c5ed5da6d8118",
    "0xd807aa98a3030242",
    "0x12835b0145706fbe",
    "0x243185be4ee4b28c",
    "0x550c7dc3d5ffb4e2",
    "0x72be5d74f27b896f",
    "0x80deb1fe3b1696b1",
    "0x9bdc06a725c71235",
    "0xc19bf174cf692694",
    "0xe49b69c19ef14ad2",
    "0xefbe4786384f25e3",
    "0x0fc19dc68b8cd5b5",
    "0x240ca1cc77ac9c65",
    "0x2de92c6f592b0275",
    "0x4a7484aa6ea6e483",
    "0x5cb0a9dcbd41fbd4",
    "0x76f988da831153b5",
    "0x983e5152ee66dfab",
    "0xa831c66d2db43210",
    "0xb00327c898fb213f",
    "0xbf597fc7beef0ee4",
    "0xc6e00bf33da88fc2",
    "0xd5a79147930aa725",
    "0x06ca6351e003826f",
    "0x142929670a0e6e70",
    "0x27b70a8546d22ffc",
    "0x2e1b21385c26c926",
    "0x4d2c6dfc5ac42aed",
    "0x53380d139d95b3df",
    "0x650a73548baf63de",
    "0x766a0abb3c77b2a8",
    "0x81c2c92e47edaee6",
    "0x92722c851482353b",
    "0xa2bfe8a14cf10364",
    "0xa81a664bbc423001",
    "0xc24b8b70d0f89791",
    "0xc76c51a30654be30",
    "0xd192e819d6ef5218",
    "0xd69906245565a910",
    "0xf40e35855771202a",
    "0x106aa07032bbd1b8",
    "0x19a4c116b8d2d0c8",
    "0x1e376c085141ab53",
    "0x2748774cdf8eeb99",
    "0x34b0bcb5e19b48a8",
    "0x391c0cb3c5c95a63",
    "0x4ed8aa4ae3418acb",
    "0x5b9cca4f7763e373",
    "0x682e6ff3d6b2b8a3",
    "0x748f82ee5defb2fc",
    "0x78a5636f43172f60",
    "0x84c87814a1f0ab72",
    "0x8cc702081a6439ec",
    "0x90befffa23631e28",
    "0xa4506cebde82bde9",
    "0xbef9a3f7b2c67915",
    "0xc67178f2e372532b",
    "0xca273eceea26619c",
    "0xd186b8c721c0c207",
    "0xeada7dd6cde0eb1e",
    "0xf57d4f7fee6ed178",
    "0x06f067aa72176fba",
    "0x0a637dc5a2c898a6",
    "0x113f9804bef90dae",
    "0x1b710b35131c471b",
    "0x28db77f523047d84",
    "0x32caab7b40c72493",
    "0x3c9ebe0a15c9bebc",
    "0x431d67c49c100d4c",
    "0x4cc5d4becb3e42b6",
    "0x597f299cfc657e2a",
    "0x5fcb6fab3ad6faec",
    "0x6c44198c4a475817"
  ].map((n) => BigInt(n))))();
  var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
  var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
  var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
  var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
  var SHA2_64B = class extends HashMD {
    constructor(outputLen, IV) {
      super(128, outputLen, 16, false);
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // h -- high 32 bits, l -- low 32 bits
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and slows hashing down (measured on sha256).
      __publicField(this, "Ah", 0);
      __publicField(this, "Al", 0);
      __publicField(this, "Bh", 0);
      __publicField(this, "Bl", 0);
      __publicField(this, "Ch", 0);
      __publicField(this, "Cl", 0);
      __publicField(this, "Dh", 0);
      __publicField(this, "Dl", 0);
      __publicField(this, "Eh", 0);
      __publicField(this, "El", 0);
      __publicField(this, "Fh", 0);
      __publicField(this, "Fl", 0);
      __publicField(this, "Gh", 0);
      __publicField(this, "Gl", 0);
      __publicField(this, "Hh", 0);
      __publicField(this, "Hl", 0);
      this.Ah = IV[0] | 0;
      this.Al = IV[1] | 0;
      this.Bh = IV[2] | 0;
      this.Bl = IV[3] | 0;
      this.Ch = IV[4] | 0;
      this.Cl = IV[5] | 0;
      this.Dh = IV[6] | 0;
      this.Dl = IV[7] | 0;
      this.Eh = IV[8] | 0;
      this.El = IV[9] | 0;
      this.Fh = IV[10] | 0;
      this.Fl = IV[11] | 0;
      this.Gh = IV[12] | 0;
      this.Gl = IV[13] | 0;
      this.Hh = IV[14] | 0;
      this.Hl = IV[15] | 0;
    }
    // prettier-ignore
    get() {
      const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
      this.Ah = Ah | 0;
      this.Al = Al | 0;
      this.Bh = Bh | 0;
      this.Bl = Bl | 0;
      this.Ch = Ch | 0;
      this.Cl = Cl | 0;
      this.Dh = Dh | 0;
      this.Dl = Dl | 0;
      this.Eh = Eh | 0;
      this.El = El | 0;
      this.Fh = Fh | 0;
      this.Fl = Fl | 0;
      this.Gh = Gh | 0;
      this.Gl = Gl | 0;
      this.Hh = Hh | 0;
      this.Hl = Hl | 0;
    }
    _cloneInto(to) {
      (to || (to = new this.constructor())).set(...this.get());
      return this._cloneIntoMeta(to);
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4) {
        SHA512_W_H[i] = view.getUint32(offset);
        SHA512_W_L[i] = view.getUint32(offset += 4);
      }
      for (let i = 16; i < 80; i++) {
        const W15h = SHA512_W_H[i - 15] | 0;
        const W15l = SHA512_W_L[i - 15] | 0;
        const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
        const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
        const W2h = SHA512_W_H[i - 2] | 0;
        const W2l = SHA512_W_L[i - 2] | 0;
        const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
        const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
        const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
        const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
        SHA512_W_H[i] = SUMh | 0;
        SHA512_W_L[i] = SUMl | 0;
      }
      let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      for (let i = 0; i < 80; i++) {
        const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
        const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
        const CHIh = Eh & Fh ^ ~Eh & Gh;
        const CHIl = El & Fl ^ ~El & Gl;
        const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
        const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
        const T1l = T1ll | 0;
        const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
        const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
        const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
        const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
        Hh = Gh | 0;
        Hl = Gl | 0;
        Gh = Fh | 0;
        Gl = Fl | 0;
        Fh = Eh | 0;
        Fl = El | 0;
        ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
        Dh = Ch | 0;
        Dl = Cl | 0;
        Ch = Bh | 0;
        Cl = Bl | 0;
        Bh = Ah | 0;
        Bl = Al | 0;
        const All = add3L(T1l, sigma0l, MAJl);
        Ah = add3H(All, T1h, sigma0h, MAJh);
        Al = All | 0;
      }
      ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
      ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
      ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
      ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
      ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
      ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
      ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
      ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
      this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
      clean(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
      this.destroyed = true;
      clean(this.buffer);
      this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  };
  var _SHA512 = class extends SHA2_64B {
    constructor() {
      super(64, SHA512_IV);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(
    () => new _SHA256(),
    /* @__PURE__ */ oidNist(1)
  );
  var sha512 = /* @__PURE__ */ createHasher(
    () => new _SHA512(),
    /* @__PURE__ */ oidNist(3)
  );

  // impl/js/bytes.mjs
  function fromHex(hex) {
    if (hex.length === 0) return new Uint8Array(0);
    if (hex.length % 2 !== 0) throw new Error(`hex string has an odd length (${hex.length})`);
    if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error(`not a hex string: "${hex.slice(0, 24)}\u2026"`);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    return out;
  }
  function toHex(b) {
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }
  function concat(...parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
  function equals(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function timingSafeEquals(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
  var reversed = (b) => new Uint8Array(b).reverse();
  var fromUtf8 = (s) => new TextEncoder().encode(s);
  var toUtf8 = (b) => new TextDecoder().decode(b);
  var dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  var readU16LE = (b, o = 0) => dv(b).getUint16(o, true);
  var readU32LE = (b, o = 0) => dv(b).getUint32(o, true);
  var readU64LE = (b, o = 0) => dv(b).getBigUint64(o, true);
  function u16LE(n) {
    const b = new Uint8Array(2);
    dv(b).setUint16(0, n, true);
    return b;
  }
  function u32LE(n) {
    const b = new Uint8Array(4);
    dv(b).setUint32(0, n, true);
    return b;
  }
  function u64LE(n) {
    const b = new Uint8Array(8);
    dv(b).setBigUint64(0, BigInt(n), true);
    return b;
  }
  function beBytes(n, len) {
    const out = new Uint8Array(len);
    for (let i = len - 1; i >= 0; i--) {
      out[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    if (n !== 0n) throw new RangeError(`does not fit in ${len} bytes`);
    return out;
  }
  var toBigBE = (b) => b.length === 0 ? 0n : BigInt("0x" + toHex(b));

  // impl/js/transaction.mjs
  var dsha256 = (b) => sha256(sha256(b));
  function varint(n) {
    if (n < 0) throw new Error("a length cannot be negative");
    if (n < 253) return Uint8Array.of(n);
    if (n <= 65535) return concat(Uint8Array.of(253), u16LE(n));
    if (n <= 4294967295) return concat(Uint8Array.of(254), u32LE(n));
    return concat(Uint8Array.of(255), u64LE(BigInt(n)));
  }
  function readVarint(b, o) {
    if (o >= b.length) throw new Error(`varint runs past the end at offset ${o}`);
    const f = b[o];
    if (f < 253) return [f, o + 1];
    if (f === 253) return [readU16LE(b, o + 1), o + 3];
    if (f === 254) return [readU32LE(b, o + 1), o + 5];
    return [Number(readU64LE(b, o + 1)), o + 9];
  }
  var need = (b, o, n) => {
    if (o + n > b.length) throw new Error(`need ${n} bytes at offset ${o}; the data ends first`);
  };
  var Tx = class _Tx {
    constructor(version = 1, inputs = [], outputs = [], locktime = 0) {
      Object.assign(this, { version, inputs, outputs, locktime });
    }
    static parse(raw) {
      const b = typeof raw === "string" ? fromHex(raw) : raw;
      need(b, 0, 4);
      const tx = new _Tx(readU32LE(b, 0));
      let o = 4, n;
      [n, o] = readVarint(b, o);
      for (let i = 0; i < n; i++) {
        need(b, o, 36);
        const txid = b.subarray(o, o + 32);
        const vout = readU32LE(b, o + 32);
        o += 36;
        let len;
        [len, o] = readVarint(b, o);
        need(b, o, len + 4);
        tx.inputs.push({ txid, vout, script: b.subarray(o, o + len), sequence: readU32LE(b, o + len) });
        o += len + 4;
      }
      ;
      [n, o] = readVarint(b, o);
      for (let i = 0; i < n; i++) {
        need(b, o, 8);
        const value = Number(readU64LE(b, o));
        o += 8;
        let len;
        [len, o] = readVarint(b, o);
        need(b, o, len);
        tx.outputs.push({ value, script: b.subarray(o, o + len) });
        o += len;
      }
      need(b, o, 4);
      tx.locktime = readU32LE(b, o);
      o += 4;
      if (o !== b.length) throw new Error(`${b.length - o} trailing byte(s) after the transaction`);
      return tx;
    }
    serialize() {
      const parts = [u32LE(this.version), varint(this.inputs.length)];
      for (const i of this.inputs) {
        parts.push(i.txid, u32LE(i.vout), varint(i.script.length), i.script, u32LE(i.sequence));
      }
      parts.push(varint(this.outputs.length));
      for (const ou of this.outputs) {
        parts.push(u64LE(ou.value), varint(ou.script.length), ou.script);
      }
      parts.push(u32LE(this.locktime));
      return concat(...parts);
    }
    hex() {
      return toHex(this.serialize());
    }
    /** ⚠ The txid a person reads is the hash REVERSED. */
    /** ⚠ The txid a person reads is the hash REVERSED — and `reversed` copies, never mutates. */
    txid() {
      return toHex(reversed(dsha256(this.serialize())));
    }
    /** ★ 100 sat/KB, never ARC's suggestion. ⚠ Rounded UP: a fee below the floor is a stuck tx. */
    fee(satPerKb = 100) {
      return Math.ceil(this.serialize().length * satPerKb / 1e3);
    }
  };
  var SIGHASH = { ALL: 1, NONE: 2, SINGLE: 3, FORKID: 64, ANYONECANPAY: 128, ALL_FORKID: 65 };
  var ZERO32 = new Uint8Array(32);
  function preimage(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID) {
    const inp = tx.inputs[inputIndex];
    if (!inp) throw new Error(`no input at index ${inputIndex}`);
    if (amount < 0) throw new Error("an amount cannot be negative");
    const base = sighashType & 31;
    const acp = (sighashType & SIGHASH.ANYONECANPAY) !== 0;
    let hashPrevouts = ZERO32, hashSequence = ZERO32, hashOutputs = ZERO32;
    if (!acp) {
      hashPrevouts = dsha256(concat(...tx.inputs.flatMap((i) => [i.txid, u32LE(i.vout)])));
      if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
        hashSequence = dsha256(concat(...tx.inputs.map((i) => u32LE(i.sequence))));
    }
    const outBytes = (o) => concat(u64LE(o.value), varint(o.script.length), o.script);
    if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
      hashOutputs = dsha256(concat(...tx.outputs.map(outBytes)));
    else if (base === SIGHASH.SINGLE && tx.outputs[inputIndex])
      hashOutputs = dsha256(outBytes(tx.outputs[inputIndex]));
    return concat(
      u32LE(tx.version),
      hashPrevouts,
      hashSequence,
      inp.txid,
      u32LE(inp.vout),
      varint(scriptCode.length),
      scriptCode,
      u64LE(amount),
      u32LE(inp.sequence),
      hashOutputs,
      u32LE(tx.locktime),
      u32LE(sighashType)
    );
  }
  var sighash = (...a) => dsha256(preimage(...a));

  // impl/js/script.mjs
  var OP = {
    OP_0: 0,
    OP_FALSE: 0,
    OP_PUSHDATA1: 76,
    OP_PUSHDATA2: 77,
    OP_PUSHDATA4: 78,
    OP_1NEGATE: 79,
    OP_RESERVED: 80,
    OP_1: 81,
    OP_TRUE: 81,
    OP_2: 82,
    OP_3: 83,
    OP_4: 84,
    OP_5: 85,
    OP_6: 86,
    OP_7: 87,
    OP_8: 88,
    OP_9: 89,
    OP_10: 90,
    OP_11: 91,
    OP_12: 92,
    OP_13: 93,
    OP_14: 94,
    OP_15: 95,
    OP_16: 96,
    // control
    OP_NOP: 97,
    OP_VER: 98,
    OP_IF: 99,
    OP_NOTIF: 100,
    OP_VERIF: 101,
    OP_VERNOTIF: 102,
    OP_ELSE: 103,
    OP_ENDIF: 104,
    OP_VERIFY: 105,
    OP_RETURN: 106,
    // stack
    OP_TOALTSTACK: 107,
    OP_FROMALTSTACK: 108,
    OP_2DROP: 109,
    OP_2DUP: 110,
    OP_3DUP: 111,
    OP_2OVER: 112,
    OP_2ROT: 113,
    OP_2SWAP: 114,
    OP_IFDUP: 115,
    OP_DEPTH: 116,
    OP_DROP: 117,
    OP_DUP: 118,
    OP_NIP: 119,
    OP_OVER: 120,
    OP_PICK: 121,
    OP_ROLL: 122,
    OP_ROT: 123,
    OP_SWAP: 124,
    OP_TUCK: 125,
    // strings ★ re-enabled on this chain; disabled in legacy Bitcoin
    OP_CAT: 126,
    OP_SPLIT: 127,
    OP_NUM2BIN: 128,
    OP_BIN2NUM: 129,
    OP_SIZE: 130,
    // bitwise
    OP_INVERT: 131,
    OP_AND: 132,
    OP_OR: 133,
    OP_XOR: 134,
    OP_EQUAL: 135,
    OP_EQUALVERIFY: 136,
    OP_RESERVED1: 137,
    OP_RESERVED2: 138,
    // arithmetic
    OP_1ADD: 139,
    OP_1SUB: 140,
    OP_2MUL: 141,
    OP_2DIV: 142,
    OP_NEGATE: 143,
    OP_ABS: 144,
    OP_NOT: 145,
    OP_0NOTEQUAL: 146,
    OP_ADD: 147,
    OP_SUB: 148,
    OP_MUL: 149,
    OP_DIV: 150,
    OP_MOD: 151,
    OP_LSHIFT: 152,
    OP_RSHIFT: 153,
    OP_BOOLAND: 154,
    OP_BOOLOR: 155,
    OP_NUMEQUAL: 156,
    OP_NUMEQUALVERIFY: 157,
    OP_NUMNOTEQUAL: 158,
    OP_LESSTHAN: 159,
    OP_GREATERTHAN: 160,
    OP_LESSTHANOREQUAL: 161,
    OP_GREATERTHANOREQUAL: 162,
    OP_MIN: 163,
    OP_MAX: 164,
    OP_WITHIN: 165,
    // crypto
    OP_RIPEMD160: 166,
    OP_SHA1: 167,
    OP_SHA256: 168,
    OP_HASH160: 169,
    OP_HASH256: 170,
    OP_CODESEPARATOR: 171,
    OP_CHECKSIG: 172,
    OP_CHECKSIGVERIFY: 173,
    OP_CHECKMULTISIG: 174,
    OP_CHECKMULTISIGVERIFY: 175,
    // reserved
    OP_NOP1: 176,
    OP_NOP2: 177,
    OP_NOP3: 178,
    OP_NOP4: 179,
    OP_NOP5: 180,
    OP_NOP6: 181,
    OP_NOP7: 182,
    OP_NOP8: 183,
    OP_NOP9: 184,
    OP_NOP10: 185,
    OP_INVALIDOPCODE: 255
  };
  var OP_NAME = (() => {
    const m = {};
    for (const [k, v] of Object.entries(OP)) if (!(v in m)) m[v] = k;
    return m;
  })();
  function minimalPush(data) {
    const d = data;
    if (d.length === 0) return Uint8Array.of(OP.OP_0);
    if (d.length === 1 && d[0] >= 1 && d[0] <= 16) return Uint8Array.of(OP.OP_1 + d[0] - 1);
    if (d.length === 1 && d[0] === 129) return Uint8Array.of(OP.OP_1NEGATE);
    if (d.length <= 75) return concat(Uint8Array.of(d.length), d);
    if (d.length <= 255) return concat(Uint8Array.of(OP.OP_PUSHDATA1, d.length), d);
    if (d.length <= 65535) return concat(Uint8Array.of(OP.OP_PUSHDATA2), u16LE(d.length), d);
    return concat(Uint8Array.of(OP.OP_PUSHDATA4), u32LE(d.length), d);
  }
  var Script = class _Script {
    /** @param {{op:number,data?:Uint8Array}[]} chunks */
    constructor(chunks = []) {
      this.chunks = chunks;
    }
    static fromBinary(bytes) {
      const b = bytes;
      const chunks = [];
      let i = 0;
      while (i < b.length) {
        const op3 = b[i++];
        if (op3 > 0 && op3 <= 75) {
          chunks.push({ op: op3, data: b.subarray(i, Math.min(i + op3, b.length)) });
          i += op3;
        } else if (op3 === OP.OP_PUSHDATA1 || op3 === OP.OP_PUSHDATA2 || op3 === OP.OP_PUSHDATA4) {
          const w = op3 === OP.OP_PUSHDATA1 ? 1 : op3 === OP.OP_PUSHDATA2 ? 2 : 4;
          if (i + w > b.length) {
            chunks.push({ op: op3 });
            break;
          }
          const n = w === 1 ? b[i] : w === 2 ? readU16LE(b, i) : readU32LE(b, i);
          i += w;
          chunks.push({ op: op3, data: b.subarray(i, Math.min(i + n, b.length)) });
          i += n;
        } else {
          chunks.push({ op: op3 });
        }
      }
      return new _Script(chunks);
    }
    static fromHex(hex) {
      return _Script.fromBinary(fromHex(hex));
    }
    /** ★ Honours an explicit `op`, so a script parsed off the chain round-trips EXACTLY — minimal or not. */
    static toBinary(chunks) {
      const parts = [];
      for (const c of chunks) {
        if (c.data === void 0 || c.data === null) {
          parts.push(Uint8Array.of(c.op));
          continue;
        }
        const d = c.data;
        if (c.op === void 0) {
          parts.push(minimalPush(d));
          continue;
        }
        if (c.op > 0 && c.op <= 75) {
          parts.push(Uint8Array.of(c.op), d);
          continue;
        }
        if (c.op === OP.OP_PUSHDATA1) {
          parts.push(Uint8Array.of(c.op, d.length), d);
          continue;
        }
        if (c.op === OP.OP_PUSHDATA2) {
          parts.push(Uint8Array.of(c.op), u16LE(d.length), d);
          continue;
        }
        if (c.op === OP.OP_PUSHDATA4) {
          parts.push(Uint8Array.of(c.op), u32LE(d.length), d);
          continue;
        }
        parts.push(Uint8Array.of(c.op), d);
      }
      return concat(...parts);
    }
    static toHex(chunks) {
      return toHex(_Script.toBinary(chunks));
    }
    toBinary() {
      return _Script.toBinary(this.chunks);
    }
    toHex() {
      return toHex(this.toBinary());
    }
    /** Readable form. ⚠ For humans and diffs, never for consensus. */
    toASM() {
      return this.chunks.map((c) => c.data !== void 0 && c.data !== null && c.data.length ? toHex(c.data) : OP_NAME[c.op] ?? `OP_UNKNOWN_${c.op}`).join(" ");
    }
  };
  var LockingScript = class _LockingScript extends Script {
    static fromBinary(b) {
      return new _LockingScript(Script.fromBinary(b).chunks);
    }
    static fromHex(h) {
      return _LockingScript.fromBinary(fromHex(h));
    }
  };
  var UnlockingScript = class _UnlockingScript extends Script {
    static fromBinary(b) {
      return new _UnlockingScript(Script.fromBinary(b).chunks);
    }
    static fromHex(h) {
      return _UnlockingScript.fromBinary(fromHex(h));
    }
  };

  // impl/js/secp256k1.mjs
  var P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  var N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  var Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  var Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
  var G = { x: Gx, y: Gy };
  var mod = (a, m = P) => (a % m + m) % m;
  var LAST_BASE = 0n;
  function modPow(base, exp, m) {
    let r = 1n, b = mod(base, m);
    LAST_BASE = b;
    while (exp > 0n) {
      if (exp & 1n) r = r * b % m;
      b = b * b % m;
      exp >>= 1n;
    }
    return r;
  }
  var inv = (a) => modPow(a, P - 2n, P);
  var invN = (a) => modPow(mod(a, N), N - 2n, N);
  var ADDS = 0;
  function add2(p, q) {
    ADDS++;
    if (p === null) return q;
    if (q === null) return p;
    let lam;
    if (p.x === q.x) {
      if (mod(p.y + q.y) === 0n) return null;
      lam = mod(3n * p.x * p.x * inv(2n * p.y));
    } else {
      lam = mod((q.y - p.y) * inv(q.x - p.x));
    }
    const x = mod(lam * lam - p.x - q.x);
    return { x, y: mod(lam * (p.x - x) - p.y) };
  }
  function mulRaw(k, p) {
    let r = null, acc = p;
    while (k > 0n) {
      if (k & 1n) r = add2(r, acc);
      acc = add2(acc, acc);
      k >>= 1n;
    }
    return r;
  }
  var mul = (k, p = G) => mulRaw(mod(k, N), p);
  var J_INF = { X: 0n, Y: 1n, Z: 0n };
  function jDbl({ X, Y, Z }) {
    ADDS++;
    if (Z === 0n || Y === 0n) return J_INF;
    const A = mod(X * X), B = mod(Y * Y), C = mod(B * B);
    const D = mod(2n * (mod((X + B) * (X + B)) - A - C));
    const E = mod(3n * A), F = mod(E * E);
    const X3 = mod(F - 2n * D);
    return { X: X3, Y: mod(E * (D - X3) - 8n * C), Z: mod(2n * Y * Z) };
  }
  function jAdd(P1, P2) {
    ADDS++;
    if (P1.Z === 0n) return P2;
    if (P2.Z === 0n) return P1;
    const Z1Z1 = mod(P1.Z * P1.Z), Z2Z2 = mod(P2.Z * P2.Z);
    const U1 = mod(P1.X * Z2Z2), U2 = mod(P2.X * Z1Z1);
    const S1 = mod(P1.Y * P2.Z * Z2Z2), S2 = mod(P2.Y * P1.Z * Z1Z1);
    const H = mod(U2 - U1), r = mod(2n * (S2 - S1));
    if (H === 0n) return r === 0n ? jDbl(P1) : J_INF;
    const I = mod(4n * H * H), J = mod(H * I), V = mod(U1 * I);
    const X3 = mod(r * r - J - 2n * V);
    return {
      X: X3,
      Y: mod(r * (V - X3) - 2n * S1 * J),
      Z: mod((mod((P1.Z + P2.Z) * (P1.Z + P2.Z)) - Z1Z1 - Z2Z2) * H)
    };
  }
  var jToAffine = ({ X, Y, Z }) => {
    if (Z === 0n) return null;
    const zi = inv(Z), zi2 = mod(zi * zi);
    return { x: mod(X * zi2), y: mod(Y * zi2 * zi) };
  };
  var LAST_SCALAR = 0n;
  function mulLadder(k, p, width) {
    const R = [J_INF, { X: p.x, Y: p.y, Z: 1n }];
    for (let i = width - 1; i >= 0; i--) {
      const b = Number(k >> BigInt(i) & 1n);
      R[1 - b] = jAdd(R[0], R[1]);
      R[b] = jDbl(R[b]);
    }
    return jToAffine(R[0]);
  }
  var rand8 = (n) => crypto.getRandomValues(new Uint8Array(n));
  var LADDER_WIDTH = 321;
  function mulBlinded(k, p = G, rand = rand8) {
    k = mod(k, N);
    if (k === 0n) return null;
    let b = 0n;
    for (const byte of rand(8)) b = b << 8n | BigInt(byte);
    if (b === 0n) b = 1n;
    LAST_SCALAR = k + b * N;
    return mulLadder(LAST_SCALAR, p, LADDER_WIDTH);
  }
  function invNBlinded(k, rand = rand8) {
    let t = 0n;
    for (const byte of rand(32)) t = t << 8n | BigInt(byte);
    t = mod(t, N);
    if (t === 0n) t = 1n;
    return mod(invN(mod(k * t, N)) * t, N);
  }
  var serP = (pt) => concat(Uint8Array.of(2 + Number(pt.y & 1n)), beBytes(pt.x, 32));
  var ser256 = (k) => beBytes(k, 32);
  var ser32 = (i) => beBytes(BigInt(i), 4);

  // node_modules/@noble/hashes/hmac.js
  var _HMAC = class {
    constructor(hash, key2) {
      __publicField(this, "oHash");
      __publicField(this, "iHash");
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "canXOF", false);
      __publicField(this, "finished", false);
      __publicField(this, "destroyed", false);
      ahash(hash);
      abytes(key2, void 0, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("expected Hash instance");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key2.length > blockLen ? hash.create().update(key2).digest() : key2);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean(pad);
    }
    update(buf) {
      aexists(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const buf = out.subarray(0, this.outputLen);
      this.iHash.digestInto(buf);
      this.oHash.update(buf);
      this.oHash.digestInto(buf);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to || (to = Object.create(Object.getPrototypeOf(this), {}));
      const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.canXOF = canXOF;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  };
  var hmac = /* @__PURE__ */ (() => {
    const hmac_ = (hash, key2, message) => new _HMAC(hash, key2).update(message).digest();
    hmac_.create = (hash, key2) => new _HMAC(hash, key2);
    return hmac_;
  })();

  // impl/js/rfc6979.mjs
  var hmac256 = (key2, msg) => hmac(sha256, key2, msg);
  function bits2int(b, qlen) {
    const v = toBigBE(b);
    const blen = b.length * 8;
    return blen > qlen ? v >> BigInt(blen - qlen) : v;
  }
  function int2octets(x, rlen) {
    const out = new Uint8Array(rlen);
    for (let i = rlen - 1; i >= 0; i--) {
      out[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    if (x !== 0n) throw new RangeError("int2octets: value wider than the order");
    return out;
  }
  var bitlen = (n) => n === 0n ? 0 : n.toString(2).length;
  function rfc6979k(q, x, h1, attempt = 0) {
    const qlen = bitlen(q);
    const rlen = Math.ceil(qlen / 8);
    const h1int = bits2int(h1, qlen);
    const z2 = int2octets(h1int >= q ? h1int - q : h1int, rlen);
    const x2 = int2octets(x, rlen);
    let V = new Uint8Array(32).fill(1);
    let K = new Uint8Array(32).fill(0);
    K = hmac256(K, concat(V, Uint8Array.of(0), x2, z2));
    V = hmac256(K, V);
    K = hmac256(K, concat(V, Uint8Array.of(1), x2, z2));
    V = hmac256(K, V);
    for (let skipped = 0; ; ) {
      let T = new Uint8Array(0);
      while (T.length * 8 < qlen) {
        V = hmac256(K, V);
        T = concat(T, V);
      }
      const cand = bits2int(T, qlen);
      if (cand >= 1n && cand < q) {
        if (skipped === attempt) return cand;
        skipped++;
      }
      K = hmac256(K, concat(V, Uint8Array.of(0)));
      V = hmac256(K, V);
    }
  }

  // impl/js/ecdsa.mjs
  var toBig = toBigBE;
  function publicKey(d, compressed = true) {
    const pt = mulBlinded(mod(d, N), G);
    if (pt === null) throw new Error("private key out of range");
    return compressed ? serP(pt) : concat(Uint8Array.of(4), beBytes(pt.x, 32), beBytes(pt.y, 32));
  }
  function derInt(v) {
    let b = beBytes(v, 32);
    const first = b.findIndex((x) => x !== 0);
    b = b.subarray(first === -1 ? 31 : first);
    if (b[0] & 128) b = concat(Uint8Array.of(0), b);
    return concat(Uint8Array.of(2, b.length), b);
  }
  function encodeDer(r, s) {
    const body = concat(derInt(r), derInt(s));
    return concat(Uint8Array.of(48, body.length), body);
  }
  function decodeDer(sig, allowTrailing = false) {
    const b = sig;
    if (b.length < 8 || b[0] !== 48) return null;
    const len = b[1];
    if (len & 128) return null;
    if (!allowTrailing && 2 + len !== b.length) return null;
    if (2 + len > b.length) return null;
    let p = 2;
    const readInt = () => {
      if (b[p++] !== 2) return null;
      const l = b[p++];
      if (l === 0 || l > 33 || p + l > b.length) return null;
      const v = b.subarray(p, p + l);
      p += l;
      if (v[0] & 128) return null;
      if (v[0] === 0 && !(v[1] & 128)) return null;
      return toBig(v);
    };
    const r = readInt();
    if (r === null) return null;
    const s = readInt();
    if (s === null) return null;
    if (p !== 2 + len) return null;
    if (r <= 0n || s <= 0n || r >= N || s >= N) return null;
    return [r, s];
  }
  function sign(d, digest32, { lowS = false, rand } = {}) {
    if (digest32.length !== 32) throw new Error("a digest is 32 bytes");
    const z = toBig(digest32);
    for (let attempt = 0; attempt < 64; attempt++) {
      const k = rfc6979k(N, mod(d, N), digest32, attempt);
      const pt = mulBlinded(k, G, rand);
      if (pt === null) continue;
      const r = mod(pt.x, N);
      if (r === 0n) continue;
      let s = mod(invNBlinded(k, rand) * (z + r * mod(d, N)), N);
      if (s === 0n) continue;
      if (lowS && s > N / 2n) s = N - s;
      return encodeDer(r, s);
    }
    throw new Error("no valid signature after 64 attempts \u2014 statistically impossible; something is wrong");
  }
  function verifyDigest(sig, pub, digest32, allowTrailing = false) {
    const parsed = decodeDer(sig, allowTrailing);
    if (parsed === null) return false;
    const [r, s] = parsed;
    const Q = decodePoint(pub);
    if (Q === null) return false;
    const z = toBig(digest32);
    const w = invN(s);
    const p1 = mul(mod(z * w, N), G);
    const p2 = mul(mod(r * w, N), Q);
    const R = add2(p1, p2);
    return R !== null && mod(R.x, N) === r;
  }
  function decodePoint(pub) {
    const b = pub;
    if (b.length === 33 && (b[0] === 2 || b[0] === 3)) {
      const x = toBig(b.subarray(1));
      if (x >= P) return null;
      const y2 = mod(x * x % P * x + 7n, P);
      let y = modPow(y2, (P + 1n) / 4n, P);
      if (modPow(y, 2n, P) !== y2) return null;
      if ((y & 1n) !== BigInt(b[0] & 1)) y = P - y;
      return { x, y };
    }
    if (b.length === 65 && b[0] === 4) {
      const x = toBig(b.subarray(1, 33)), y = toBig(b.subarray(33));
      if (x >= P || y >= P) return null;
      if (mod(y * y, P) !== mod(x * x % P * x + 7n, P)) return null;
      return { x, y };
    }
    return null;
  }

  // node_modules/@noble/hashes/legacy.js
  var Rho160 = /* @__PURE__ */ Uint8Array.from([
    7,
    4,
    13,
    1,
    10,
    6,
    15,
    3,
    12,
    0,
    9,
    5,
    2,
    14,
    11,
    8
  ]);
  var Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
  var Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
  var idxLR = /* @__PURE__ */ (() => {
    const L = [Id160];
    const R = [Pi160];
    const res = [L, R];
    for (let i = 0; i < 4; i++)
      for (let j of res)
        j.push(j[i].map((k) => Rho160[k]));
    return res;
  })();
  var idxL = /* @__PURE__ */ (() => idxLR[0])();
  var idxR = /* @__PURE__ */ (() => idxLR[1])();
  var shifts160 = /* @__PURE__ */ [
    [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
    [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
    [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
    [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
    [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
  ].map((i) => Uint8Array.from(i));
  var shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
  var shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
  var Kl160 = /* @__PURE__ */ Uint32Array.from([
    0,
    1518500249,
    1859775393,
    2400959708,
    2840853838
  ]);
  var Kr160 = /* @__PURE__ */ Uint32Array.from([
    1352829926,
    1548603684,
    1836072691,
    2053994217,
    0
  ]);
  function ripemd_f(group, x, y, z) {
    if (group === 0)
      return x ^ y ^ z;
    if (group === 1)
      return x & y | ~x & z;
    if (group === 2)
      return (x | ~y) ^ z;
    if (group === 3)
      return x & z | y & ~z;
    return x ^ (y | ~z);
  }
  var BUF_160 = /* @__PURE__ */ new Uint32Array(16);
  var _RIPEMD160 = class extends HashMD {
    constructor() {
      super(64, 20, 8, true);
      __publicField(this, "h0", 1732584193 | 0);
      __publicField(this, "h1", 4023233417 | 0);
      __publicField(this, "h2", 2562383102 | 0);
      __publicField(this, "h3", 271733878 | 0);
      __publicField(this, "h4", 3285377520 | 0);
    }
    get() {
      const { h0, h1, h2, h3, h4 } = this;
      return [h0, h1, h2, h3, h4];
    }
    set(h0, h1, h2, h3, h4) {
      this.h0 = h0 | 0;
      this.h1 = h1 | 0;
      this.h2 = h2 | 0;
      this.h3 = h3 | 0;
      this.h4 = h4 | 0;
    }
    _cloneInto(to) {
      (to || (to = new this.constructor())).set(...this.get());
      return this._cloneIntoMeta(to);
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        BUF_160[i] = view.getUint32(offset, true);
      let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
      for (let group = 0; group < 5; group++) {
        const rGroup = 4 - group;
        const hbl = Kl160[group], hbr = Kr160[group];
        const rl = idxL[group], rr = idxR[group];
        const sl = shiftsL160[group], sr = shiftsR160[group];
        for (let i = 0; i < 16; i++) {
          const tl = rotl(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el | 0;
          al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl;
        }
        for (let i = 0; i < 16; i++) {
          const tr = rotl(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er | 0;
          ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr;
        }
      }
      this.set(this.h1 + cl + dr | 0, this.h2 + dl + er | 0, this.h3 + el + ar | 0, this.h4 + al + br | 0, this.h0 + bl + cr | 0);
    }
    roundClean() {
      clean(BUF_160);
    }
    destroy() {
      this.destroyed = true;
      clean(this.buffer);
      this.set(0, 0, 0, 0, 0);
    }
  };
  var ripemd160 = /* @__PURE__ */ createHasher(() => new _RIPEMD160());

  // impl/js/bip32.mjs
  var XPRV = fromHex("0488ade4");
  var XPUB = fromHex("0488b21e");
  var HARDENED = 2147483648;
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  var hash160 = (b) => ripemd160(sha256(b));
  function b58check(payload) {
    const raw = concat(payload, sha256(sha256(payload)).subarray(0, 4));
    let n = 0n;
    for (const byte of raw) n = n * 256n + BigInt(byte);
    let out = "";
    while (n > 0n) {
      out = B58[Number(n % 58n)] + out;
      n /= 58n;
    }
    let pad = 0;
    while (pad < raw.length && raw[pad] === 0) pad++;
    return "1".repeat(pad) + out;
  }
  var _Node_instances, ser_fn;
  var _Node = class _Node {
    constructor(k, K, chain, depth = 0, parentFp = new Uint8Array(4), index = 0) {
      __privateAdd(this, _Node_instances);
      this.k = k;
      this.K = K ?? mulBlinded(k);
      this.chain = chain;
      this.depth = depth;
      this.parentFp = parentFp;
      this.index = index;
    }
    xpub() {
      return __privateMethod(this, _Node_instances, ser_fn).call(this, XPUB, serP(this.K));
    }
    xprv() {
      if (this.k === null) throw new Error("no private key in this node");
      return __privateMethod(this, _Node_instances, ser_fn).call(this, XPRV, concat(new Uint8Array(1), ser256(this.k)));
    }
    fingerprint() {
      return hash160(serP(this.K)).subarray(0, 4);
    }
    child(index) {
      const hardened = index >= HARDENED;
      let data;
      if (hardened) {
        if (this.k === null) throw new Error("a hardened child needs the private key");
        data = concat(new Uint8Array(1), ser256(this.k), ser32(index));
      } else {
        data = concat(serP(this.K), ser32(index));
      }
      const I = hmac(sha512, this.chain, data);
      const IL = toBigBE(I.subarray(0, 32));
      const IR = I.subarray(32);
      if (IL >= N) return this.child(index + 1);
      if (this.k !== null) {
        const k = (IL + this.k) % N;
        if (k === 0n) return this.child(index + 1);
        return new _Node(k, null, IR, this.depth + 1, this.fingerprint(), index);
      }
      const K = add2(mulBlinded(IL), this.K);
      if (K === null) return this.child(index + 1);
      return new _Node(null, K, IR, this.depth + 1, this.fingerprint(), index);
    }
    /** `m`, `m/0'`, `m/0'/1/2'` — a prime or an h marks a hardened step. */
    derive(path) {
      const parts = path.split("/");
      if (parts[0] !== "m" && parts[0] !== "M") throw new Error(`a path starts at m, not "${parts[0]}"`);
      let node = this;
      for (const p of parts.slice(1)) {
        if (!p) throw new Error(`empty step in path "${path}"`);
        const hard = ["'", "h", "H"].includes(p.at(-1));
        const n = Number(hard ? p.slice(0, -1) : p);
        if (!Number.isInteger(n) || n < 0 || n >= HARDENED) throw new Error(`index out of range: ${p}`);
        node = node.child(hard ? n + HARDENED : n);
      }
      return node;
    }
  };
  _Node_instances = new WeakSet();
  ser_fn = function(version, key2) {
    return b58check(concat(
      version,
      Uint8Array.of(this.depth),
      this.parentFp,
      ser32(this.index),
      this.chain,
      key2
    ));
  };
  var Node = _Node;
  function fromSeed(seed) {
    const I = hmac(sha512, fromUtf8("Bitcoin seed"), seed);
    const IL = toBigBE(I.subarray(0, 32));
    if (IL === 0n || IL >= N) {
      throw new Error("invalid seed: the master key is out of range");
    }
    return new Node(IL, null, I.subarray(32));
  }

  // impl/js/address.mjs
  var B582 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  var dsha = (b) => sha256(sha256(b));
  function b58decode(s) {
    if (!s) return null;
    let n = 0n;
    for (const ch of s) {
      const i = B582.indexOf(ch);
      if (i < 0) return null;
      n = n * 58n + BigInt(i);
    }
    let hex = n.toString(16);
    if (hex.length & 1) hex = "0" + hex;
    let b = n === 0n ? new Uint8Array(0) : fromHex(hex);
    const lead = s.length - s.replace(/^1+/, "").length;
    b = concat(new Uint8Array(lead), b);
    if (b.length < 5) return null;
    const body = b.subarray(0, -4);
    if (!equals(dsha(body).subarray(0, 4), b.subarray(b.length - 4))) return null;
    return { version: body[0], payload: body.subarray(1) };
  }
  var p2pkhAddress = (pub) => b58check(concat(Uint8Array.of(0), hash160(pub)));
  var p2pkhScript = (h160) => concat(Uint8Array.of(118, 169, 20), h160, Uint8Array.of(136, 172));
  var wifEncode = (key32, compressed = true, version = 128) => {
    if (key32.length !== 32) throw new Error("a private key is 32 bytes");
    return b58check(concat(Uint8Array.of(version), key32, compressed ? Uint8Array.of(1) : new Uint8Array(0)));
  };
  function wifDecode(wif) {
    const d = b58decode(wif);
    if (!d) return null;
    const b = concat(Uint8Array.of(d.version), d.payload);
    if (b.length !== 33 && b.length !== 34) return null;
    const compressed = b.length === 34;
    if (compressed && b[33] !== 1) return null;
    return { key: b.subarray(1, 33), compressed, version: b[0] };
  }
  function scriptForAddress(addr) {
    const d = b58decode(addr);
    if (!d) throw new Error(`not a valid address: ${addr}`);
    if (d.payload.length !== 20) throw new Error(`address payload is ${d.payload.length} bytes, expected 20`);
    if (d.version !== 0) throw new Error(`address version 0x${d.version.toString(16)} is not mainnet P2PKH`);
    return p2pkhScript(d.payload);
  }

  // impl/js/signer.mjs
  var DEFAULT_PATH = "m/44'/236'/0'/0/0";
  var SignerError = class extends Error {
  };
  var Signer = class _Signer {
    /**
     * ⚠⚠ `compressed` TRAVELS WITH THE KEY, and that is not a detail: the same private key spends a
     *   DIFFERENT address compressed and uncompressed. ⇒ Importing a WIF and then defaulting to
     *   compressed hands back an address holding nothing, for a key that is provably yours.
     */
    constructor(d, compressed = true) {
      if (typeof d !== "bigint") throw new SignerError("a private key is a BigInt scalar");
      if (d < 1n || d >= N) throw new SignerError("private key out of range");
      this.d = d;
      this.compressed = compressed;
    }
    static fromPrivateKey(raw32, compressed = true) {
      if (!(raw32 instanceof Uint8Array) || raw32.length !== 32)
        throw new SignerError("a private key is 32 bytes");
      return new _Signer(BigInt("0x" + toHex(raw32)), compressed);
    }
    /**
     * ⛔ NEVER ASK ANYONE FOR A WIF. This exists so a user can import a key THEY produced, on their own
     *   machine. The standing rule is that a key is never solicited.
     */
    static fromWif(wif) {
      const d = wifDecode(wif);
      if (d === null) throw new SignerError("not a valid WIF - the checksum or the length is wrong");
      return _Signer.fromPrivateKey(d.key, d.compressed);
    }
    /** ★ From a written-down phrase. ⚠ BIP-32, not SLIP-0010 - see bip32.mjs for why they differ. */
    static fromSeed(seed, path = DEFAULT_PATH) {
      const node = fromSeed(seed).derive(path);
      if (node.k === null) throw new SignerError("that node is watch-only and cannot sign");
      return new _Signer(node.k, true);
    }
    /** ⚠ EXPORTS THE PRIVATE KEY. The caller is showing this to its owner and to nobody else. */
    toWif() {
      return wifEncode(beBytes(this.d, 32), this.compressed);
    }
    publicKey(compressed = this.compressed) {
      return publicKey(this.d, compressed);
    }
    hash160() {
      return hash160(this.publicKey());
    }
    address() {
      return p2pkhAddress(this.publicKey());
    }
    /** The locking script that pays THIS key. ★ What a change output wants. */
    lockingScript() {
      return p2pkhScript(this.hash160());
    }
    /**
     * Sign one input. Returns the DER signature **with the sighash-type byte appended**, which is what an
     * unlocking script actually carries.
     *
     * @param scriptCode the LOCKING script of the output being spent, raw and unprefixed
     * @param amount     that output's satoshis
     */
    signInput(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, { lowS = true } = {}) {
      assertAmount(amount);
      const digest = sighash(tx, inputIndex, scriptCode, amount, sighashType);
      return concat(sign(this.d, digest, { lowS }), Uint8Array.of(sighashType));
    }
    /**
     * The P2PKH unlocking script: `<signature+type> <pubkey>`.
     *
     * ★ Both pushes go through `minimalPush`, so the encoding is the shortest legal one and matches what
     *   the rest of the wallet produces. ⚠ A signature is ~71-72 bytes and a public key 33 or 65, so both
     *   land in the direct-push range - but stating that as an assumption rather than relying on it is
     *   how the wrong push form gets emitted the day one of them changes.
     */
    unlockP2PKH(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, opts = {}) {
      return concat(
        minimalPush(this.signInput(tx, inputIndex, scriptCode, amount, sighashType, opts)),
        minimalPush(this.publicKey())
      );
    }
    /**
     * Sign every input of a P2PKH transaction, IN PLACE.
     *
     * @param utxos aligned with `tx.inputs`, each `{ txid, vout, value, script }`
     *
     * ⚠⚠⚠ THE ALIGNMENT IS CHECKED, NOT ASSUMED. Handing these in the wrong ORDER signs each input against
     *   another output's script and amount ⇒ **every signature is well formed and every one is invalid**,
     *   with nothing in the transaction to say so. ⇒ The outpoints are compared and a mismatch is refused.
     *
     * ★ Signing order does not matter. A BIP-143 preimage commits to the other inputs only through
     *   `hashPrevouts` and `hashSequence`, never through their unlocking scripts, so a script written into
     *   input 0 cannot change the digest for input 1. (Under the legacy algorithm it could, which is one
     *   of the things BIP-143 fixed. The suite proves it here rather than trusting the reasoning.)
     */
    signP2PKH(tx, utxos, sighashType = SIGHASH.ALL_FORKID, opts = {}) {
      if (utxos.length !== tx.inputs.length)
        throw new SignerError(`${utxos.length} UTXOs for ${tx.inputs.length} inputs`);
      tx.inputs.forEach((inp, i) => {
        const u = utxos[i];
        const want = wireTxid(u.txid, `utxos[${i}].txid`);
        const got = wireTxid(inp.txid, `tx.inputs[${i}].txid`);
        if (!equals(want, got) || Number(u.vout) !== Number(inp.vout))
          throw new SignerError(
            `UTXO ${i} does not match input ${i}: the outpoints differ. \u21D2 The list is out of order, and signing it would produce valid-looking signatures that verify nowhere.`
          );
        inp.script = this.unlockP2PKH(tx, i, u.script, Number(u.value), sighashType, opts);
      });
      return tx;
    }
    /** Verify one input's signature the way a script would. */
    static verifyInput(tx, inputIndex, scriptCode, amount, pub, sigWithType) {
      if (!(sigWithType instanceof Uint8Array) || sigWithType.length < 2) return false;
      const type = sigWithType[sigWithType.length - 1];
      return verifyDigest(sigWithType, pub, sighash(tx, inputIndex, scriptCode, amount, type), true);
    }
  };
  function wireTxid(t, what) {
    if (t instanceof Uint8Array && t.length === 32) return t;
    if (typeof t === "string")
      throw new SignerError(
        `${what} is a string. A txid must be 32 bytes in WIRE order here, not display hex. \u21D2 If it came from an API or an explorer, convert it with reversed(fromHex(txid)).`
      );
    throw new SignerError(`${what} must be a 32-byte Uint8Array, got ${t?.length ?? typeof t}`);
  }
  function assertAmount(a) {
    if (!Number.isInteger(a) || a < 0) throw new SignerError(`amount must be a whole number of satoshis, got ${a}`);
    if (!Number.isSafeInteger(a)) throw new SignerError("amount exceeds the safe integer range");
  }
  var txidToWire = (hex) => reversed(fromHex(hex));
  var wireToTxid = (b) => toHex(reversed(b));

  // node_modules/@noble/hashes/pbkdf2.js
  function pbkdf2Init(hash, _password, _salt, _opts) {
    ahash(hash);
    const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
    const { c, dkLen, asyncTick } = opts;
    anumber(c, "c");
    anumber(dkLen, "dkLen");
    anumber(asyncTick, "asyncTick");
    if (c < 1)
      throw new Error('"c" (iterations) must be >= 1');
    if (dkLen < 1)
      throw new Error('"dkLen" must be >= 1');
    if (dkLen > (2 ** 32 - 1) * hash.outputLen)
      throw new Error("derived key too long");
    const p = kdfInputToBytes(_password, "password");
    try {
      const s = kdfInputToBytes(_salt, "salt");
      try {
        const DK = new Uint8Array(dkLen);
        const { iHash, oHash, outputLen } = hmac.create(hash, p);
        const u = new Uint8Array(outputLen);
        const eng = pbkdf2Engine(iHash, oHash, s, u);
        return { c, dkLen, asyncTick, DK, outputLen, eng };
      } finally {
        if (typeof _salt === "string")
          clean(s);
      }
    } finally {
      if (typeof _password === "string")
        clean(p);
    }
  }
  function pbkdf2Engine(iHash, oHash, salt, u) {
    const counter = new Uint8Array(4);
    const view = createView(counter);
    const salted = iHash._cloneInto().update(salt);
    const work = oHash._cloneInto();
    const iClone = iHash._cloneInto;
    const oClone = oHash._cloneInto;
    return {
      u1: (ti, Ti) => {
        view.setInt32(0, ti, false);
        salted._cloneInto(work).update(counter).digestInto(u);
        oHash._cloneInto(work).update(u).digestInto(u);
        Ti.set(u.subarray(0, Ti.length));
      },
      // Whole `F` inner loop for the sync variant: one optimized function owns the hot loop.
      rounds: (c, Ti) => {
        for (let ui = 1; ui < c; ui++) {
          iClone.call(iHash, work).update(u).digestInto(u);
          oClone.call(oHash, work).update(u).digestInto(u);
          for (let i = 0; i < Ti.length; i++)
            Ti[i] ^= u[i];
        }
      },
      output: (DK) => {
        iHash.destroy();
        oHash.destroy();
        salted.destroy();
        work.destroy();
        clean(u);
        return DK;
      }
    };
  }
  function pbkdf2(hash, password, salt, opts) {
    const { c, dkLen, DK, outputLen, eng } = pbkdf2Init(hash, password, salt, opts);
    for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += outputLen) {
      const Ti = DK.subarray(pos, pos + outputLen);
      eng.u1(ti, Ti);
      eng.rounds(c, Ti);
    }
    return eng.output(DK);
  }

  // impl/js/data/wordlist-english.mjs
  var WORDLIST_ENGLISH = [
    "abandon",
    "ability",
    "able",
    "about",
    "above",
    "absent",
    "absorb",
    "abstract",
    "absurd",
    "abuse",
    "access",
    "accident",
    "account",
    "accuse",
    "achieve",
    "acid",
    "acoustic",
    "acquire",
    "across",
    "act",
    "action",
    "actor",
    "actress",
    "actual",
    "adapt",
    "add",
    "addict",
    "address",
    "adjust",
    "admit",
    "adult",
    "advance",
    "advice",
    "aerobic",
    "affair",
    "afford",
    "afraid",
    "again",
    "age",
    "agent",
    "agree",
    "ahead",
    "aim",
    "air",
    "airport",
    "aisle",
    "alarm",
    "album",
    "alcohol",
    "alert",
    "alien",
    "all",
    "alley",
    "allow",
    "almost",
    "alone",
    "alpha",
    "already",
    "also",
    "alter",
    "always",
    "amateur",
    "amazing",
    "among",
    "amount",
    "amused",
    "analyst",
    "anchor",
    "ancient",
    "anger",
    "angle",
    "angry",
    "animal",
    "ankle",
    "announce",
    "annual",
    "another",
    "answer",
    "antenna",
    "antique",
    "anxiety",
    "any",
    "apart",
    "apology",
    "appear",
    "apple",
    "approve",
    "april",
    "arch",
    "arctic",
    "area",
    "arena",
    "argue",
    "arm",
    "armed",
    "armor",
    "army",
    "around",
    "arrange",
    "arrest",
    "arrive",
    "arrow",
    "art",
    "artefact",
    "artist",
    "artwork",
    "ask",
    "aspect",
    "assault",
    "asset",
    "assist",
    "assume",
    "asthma",
    "athlete",
    "atom",
    "attack",
    "attend",
    "attitude",
    "attract",
    "auction",
    "audit",
    "august",
    "aunt",
    "author",
    "auto",
    "autumn",
    "average",
    "avocado",
    "avoid",
    "awake",
    "aware",
    "away",
    "awesome",
    "awful",
    "awkward",
    "axis",
    "baby",
    "bachelor",
    "bacon",
    "badge",
    "bag",
    "balance",
    "balcony",
    "ball",
    "bamboo",
    "banana",
    "banner",
    "bar",
    "barely",
    "bargain",
    "barrel",
    "base",
    "basic",
    "basket",
    "battle",
    "beach",
    "bean",
    "beauty",
    "because",
    "become",
    "beef",
    "before",
    "begin",
    "behave",
    "behind",
    "believe",
    "below",
    "belt",
    "bench",
    "benefit",
    "best",
    "betray",
    "better",
    "between",
    "beyond",
    "bicycle",
    "bid",
    "bike",
    "bind",
    "biology",
    "bird",
    "birth",
    "bitter",
    "black",
    "blade",
    "blame",
    "blanket",
    "blast",
    "bleak",
    "bless",
    "blind",
    "blood",
    "blossom",
    "blouse",
    "blue",
    "blur",
    "blush",
    "board",
    "boat",
    "body",
    "boil",
    "bomb",
    "bone",
    "bonus",
    "book",
    "boost",
    "border",
    "boring",
    "borrow",
    "boss",
    "bottom",
    "bounce",
    "box",
    "boy",
    "bracket",
    "brain",
    "brand",
    "brass",
    "brave",
    "bread",
    "breeze",
    "brick",
    "bridge",
    "brief",
    "bright",
    "bring",
    "brisk",
    "broccoli",
    "broken",
    "bronze",
    "broom",
    "brother",
    "brown",
    "brush",
    "bubble",
    "buddy",
    "budget",
    "buffalo",
    "build",
    "bulb",
    "bulk",
    "bullet",
    "bundle",
    "bunker",
    "burden",
    "burger",
    "burst",
    "bus",
    "business",
    "busy",
    "butter",
    "buyer",
    "buzz",
    "cabbage",
    "cabin",
    "cable",
    "cactus",
    "cage",
    "cake",
    "call",
    "calm",
    "camera",
    "camp",
    "can",
    "canal",
    "cancel",
    "candy",
    "cannon",
    "canoe",
    "canvas",
    "canyon",
    "capable",
    "capital",
    "captain",
    "car",
    "carbon",
    "card",
    "cargo",
    "carpet",
    "carry",
    "cart",
    "case",
    "cash",
    "casino",
    "castle",
    "casual",
    "cat",
    "catalog",
    "catch",
    "category",
    "cattle",
    "caught",
    "cause",
    "caution",
    "cave",
    "ceiling",
    "celery",
    "cement",
    "census",
    "century",
    "cereal",
    "certain",
    "chair",
    "chalk",
    "champion",
    "change",
    "chaos",
    "chapter",
    "charge",
    "chase",
    "chat",
    "cheap",
    "check",
    "cheese",
    "chef",
    "cherry",
    "chest",
    "chicken",
    "chief",
    "child",
    "chimney",
    "choice",
    "choose",
    "chronic",
    "chuckle",
    "chunk",
    "churn",
    "cigar",
    "cinnamon",
    "circle",
    "citizen",
    "city",
    "civil",
    "claim",
    "clap",
    "clarify",
    "claw",
    "clay",
    "clean",
    "clerk",
    "clever",
    "click",
    "client",
    "cliff",
    "climb",
    "clinic",
    "clip",
    "clock",
    "clog",
    "close",
    "cloth",
    "cloud",
    "clown",
    "club",
    "clump",
    "cluster",
    "clutch",
    "coach",
    "coast",
    "coconut",
    "code",
    "coffee",
    "coil",
    "coin",
    "collect",
    "color",
    "column",
    "combine",
    "come",
    "comfort",
    "comic",
    "common",
    "company",
    "concert",
    "conduct",
    "confirm",
    "congress",
    "connect",
    "consider",
    "control",
    "convince",
    "cook",
    "cool",
    "copper",
    "copy",
    "coral",
    "core",
    "corn",
    "correct",
    "cost",
    "cotton",
    "couch",
    "country",
    "couple",
    "course",
    "cousin",
    "cover",
    "coyote",
    "crack",
    "cradle",
    "craft",
    "cram",
    "crane",
    "crash",
    "crater",
    "crawl",
    "crazy",
    "cream",
    "credit",
    "creek",
    "crew",
    "cricket",
    "crime",
    "crisp",
    "critic",
    "crop",
    "cross",
    "crouch",
    "crowd",
    "crucial",
    "cruel",
    "cruise",
    "crumble",
    "crunch",
    "crush",
    "cry",
    "crystal",
    "cube",
    "culture",
    "cup",
    "cupboard",
    "curious",
    "current",
    "curtain",
    "curve",
    "cushion",
    "custom",
    "cute",
    "cycle",
    "dad",
    "damage",
    "damp",
    "dance",
    "danger",
    "daring",
    "dash",
    "daughter",
    "dawn",
    "day",
    "deal",
    "debate",
    "debris",
    "decade",
    "december",
    "decide",
    "decline",
    "decorate",
    "decrease",
    "deer",
    "defense",
    "define",
    "defy",
    "degree",
    "delay",
    "deliver",
    "demand",
    "demise",
    "denial",
    "dentist",
    "deny",
    "depart",
    "depend",
    "deposit",
    "depth",
    "deputy",
    "derive",
    "describe",
    "desert",
    "design",
    "desk",
    "despair",
    "destroy",
    "detail",
    "detect",
    "develop",
    "device",
    "devote",
    "diagram",
    "dial",
    "diamond",
    "diary",
    "dice",
    "diesel",
    "diet",
    "differ",
    "digital",
    "dignity",
    "dilemma",
    "dinner",
    "dinosaur",
    "direct",
    "dirt",
    "disagree",
    "discover",
    "disease",
    "dish",
    "dismiss",
    "disorder",
    "display",
    "distance",
    "divert",
    "divide",
    "divorce",
    "dizzy",
    "doctor",
    "document",
    "dog",
    "doll",
    "dolphin",
    "domain",
    "donate",
    "donkey",
    "donor",
    "door",
    "dose",
    "double",
    "dove",
    "draft",
    "dragon",
    "drama",
    "drastic",
    "draw",
    "dream",
    "dress",
    "drift",
    "drill",
    "drink",
    "drip",
    "drive",
    "drop",
    "drum",
    "dry",
    "duck",
    "dumb",
    "dune",
    "during",
    "dust",
    "dutch",
    "duty",
    "dwarf",
    "dynamic",
    "eager",
    "eagle",
    "early",
    "earn",
    "earth",
    "easily",
    "east",
    "easy",
    "echo",
    "ecology",
    "economy",
    "edge",
    "edit",
    "educate",
    "effort",
    "egg",
    "eight",
    "either",
    "elbow",
    "elder",
    "electric",
    "elegant",
    "element",
    "elephant",
    "elevator",
    "elite",
    "else",
    "embark",
    "embody",
    "embrace",
    "emerge",
    "emotion",
    "employ",
    "empower",
    "empty",
    "enable",
    "enact",
    "end",
    "endless",
    "endorse",
    "enemy",
    "energy",
    "enforce",
    "engage",
    "engine",
    "enhance",
    "enjoy",
    "enlist",
    "enough",
    "enrich",
    "enroll",
    "ensure",
    "enter",
    "entire",
    "entry",
    "envelope",
    "episode",
    "equal",
    "equip",
    "era",
    "erase",
    "erode",
    "erosion",
    "error",
    "erupt",
    "escape",
    "essay",
    "essence",
    "estate",
    "eternal",
    "ethics",
    "evidence",
    "evil",
    "evoke",
    "evolve",
    "exact",
    "example",
    "excess",
    "exchange",
    "excite",
    "exclude",
    "excuse",
    "execute",
    "exercise",
    "exhaust",
    "exhibit",
    "exile",
    "exist",
    "exit",
    "exotic",
    "expand",
    "expect",
    "expire",
    "explain",
    "expose",
    "express",
    "extend",
    "extra",
    "eye",
    "eyebrow",
    "fabric",
    "face",
    "faculty",
    "fade",
    "faint",
    "faith",
    "fall",
    "false",
    "fame",
    "family",
    "famous",
    "fan",
    "fancy",
    "fantasy",
    "farm",
    "fashion",
    "fat",
    "fatal",
    "father",
    "fatigue",
    "fault",
    "favorite",
    "feature",
    "february",
    "federal",
    "fee",
    "feed",
    "feel",
    "female",
    "fence",
    "festival",
    "fetch",
    "fever",
    "few",
    "fiber",
    "fiction",
    "field",
    "figure",
    "file",
    "film",
    "filter",
    "final",
    "find",
    "fine",
    "finger",
    "finish",
    "fire",
    "firm",
    "first",
    "fiscal",
    "fish",
    "fit",
    "fitness",
    "fix",
    "flag",
    "flame",
    "flash",
    "flat",
    "flavor",
    "flee",
    "flight",
    "flip",
    "float",
    "flock",
    "floor",
    "flower",
    "fluid",
    "flush",
    "fly",
    "foam",
    "focus",
    "fog",
    "foil",
    "fold",
    "follow",
    "food",
    "foot",
    "force",
    "forest",
    "forget",
    "fork",
    "fortune",
    "forum",
    "forward",
    "fossil",
    "foster",
    "found",
    "fox",
    "fragile",
    "frame",
    "frequent",
    "fresh",
    "friend",
    "fringe",
    "frog",
    "front",
    "frost",
    "frown",
    "frozen",
    "fruit",
    "fuel",
    "fun",
    "funny",
    "furnace",
    "fury",
    "future",
    "gadget",
    "gain",
    "galaxy",
    "gallery",
    "game",
    "gap",
    "garage",
    "garbage",
    "garden",
    "garlic",
    "garment",
    "gas",
    "gasp",
    "gate",
    "gather",
    "gauge",
    "gaze",
    "general",
    "genius",
    "genre",
    "gentle",
    "genuine",
    "gesture",
    "ghost",
    "giant",
    "gift",
    "giggle",
    "ginger",
    "giraffe",
    "girl",
    "give",
    "glad",
    "glance",
    "glare",
    "glass",
    "glide",
    "glimpse",
    "globe",
    "gloom",
    "glory",
    "glove",
    "glow",
    "glue",
    "goat",
    "goddess",
    "gold",
    "good",
    "goose",
    "gorilla",
    "gospel",
    "gossip",
    "govern",
    "gown",
    "grab",
    "grace",
    "grain",
    "grant",
    "grape",
    "grass",
    "gravity",
    "great",
    "green",
    "grid",
    "grief",
    "grit",
    "grocery",
    "group",
    "grow",
    "grunt",
    "guard",
    "guess",
    "guide",
    "guilt",
    "guitar",
    "gun",
    "gym",
    "habit",
    "hair",
    "half",
    "hammer",
    "hamster",
    "hand",
    "happy",
    "harbor",
    "hard",
    "harsh",
    "harvest",
    "hat",
    "have",
    "hawk",
    "hazard",
    "head",
    "health",
    "heart",
    "heavy",
    "hedgehog",
    "height",
    "hello",
    "helmet",
    "help",
    "hen",
    "hero",
    "hidden",
    "high",
    "hill",
    "hint",
    "hip",
    "hire",
    "history",
    "hobby",
    "hockey",
    "hold",
    "hole",
    "holiday",
    "hollow",
    "home",
    "honey",
    "hood",
    "hope",
    "horn",
    "horror",
    "horse",
    "hospital",
    "host",
    "hotel",
    "hour",
    "hover",
    "hub",
    "huge",
    "human",
    "humble",
    "humor",
    "hundred",
    "hungry",
    "hunt",
    "hurdle",
    "hurry",
    "hurt",
    "husband",
    "hybrid",
    "ice",
    "icon",
    "idea",
    "identify",
    "idle",
    "ignore",
    "ill",
    "illegal",
    "illness",
    "image",
    "imitate",
    "immense",
    "immune",
    "impact",
    "impose",
    "improve",
    "impulse",
    "inch",
    "include",
    "income",
    "increase",
    "index",
    "indicate",
    "indoor",
    "industry",
    "infant",
    "inflict",
    "inform",
    "inhale",
    "inherit",
    "initial",
    "inject",
    "injury",
    "inmate",
    "inner",
    "innocent",
    "input",
    "inquiry",
    "insane",
    "insect",
    "inside",
    "inspire",
    "install",
    "intact",
    "interest",
    "into",
    "invest",
    "invite",
    "involve",
    "iron",
    "island",
    "isolate",
    "issue",
    "item",
    "ivory",
    "jacket",
    "jaguar",
    "jar",
    "jazz",
    "jealous",
    "jeans",
    "jelly",
    "jewel",
    "job",
    "join",
    "joke",
    "journey",
    "joy",
    "judge",
    "juice",
    "jump",
    "jungle",
    "junior",
    "junk",
    "just",
    "kangaroo",
    "keen",
    "keep",
    "ketchup",
    "key",
    "kick",
    "kid",
    "kidney",
    "kind",
    "kingdom",
    "kiss",
    "kit",
    "kitchen",
    "kite",
    "kitten",
    "kiwi",
    "knee",
    "knife",
    "knock",
    "know",
    "lab",
    "label",
    "labor",
    "ladder",
    "lady",
    "lake",
    "lamp",
    "language",
    "laptop",
    "large",
    "later",
    "latin",
    "laugh",
    "laundry",
    "lava",
    "law",
    "lawn",
    "lawsuit",
    "layer",
    "lazy",
    "leader",
    "leaf",
    "learn",
    "leave",
    "lecture",
    "left",
    "leg",
    "legal",
    "legend",
    "leisure",
    "lemon",
    "lend",
    "length",
    "lens",
    "leopard",
    "lesson",
    "letter",
    "level",
    "liar",
    "liberty",
    "library",
    "license",
    "life",
    "lift",
    "light",
    "like",
    "limb",
    "limit",
    "link",
    "lion",
    "liquid",
    "list",
    "little",
    "live",
    "lizard",
    "load",
    "loan",
    "lobster",
    "local",
    "lock",
    "logic",
    "lonely",
    "long",
    "loop",
    "lottery",
    "loud",
    "lounge",
    "love",
    "loyal",
    "lucky",
    "luggage",
    "lumber",
    "lunar",
    "lunch",
    "luxury",
    "lyrics",
    "machine",
    "mad",
    "magic",
    "magnet",
    "maid",
    "mail",
    "main",
    "major",
    "make",
    "mammal",
    "man",
    "manage",
    "mandate",
    "mango",
    "mansion",
    "manual",
    "maple",
    "marble",
    "march",
    "margin",
    "marine",
    "market",
    "marriage",
    "mask",
    "mass",
    "master",
    "match",
    "material",
    "math",
    "matrix",
    "matter",
    "maximum",
    "maze",
    "meadow",
    "mean",
    "measure",
    "meat",
    "mechanic",
    "medal",
    "media",
    "melody",
    "melt",
    "member",
    "memory",
    "mention",
    "menu",
    "mercy",
    "merge",
    "merit",
    "merry",
    "mesh",
    "message",
    "metal",
    "method",
    "middle",
    "midnight",
    "milk",
    "million",
    "mimic",
    "mind",
    "minimum",
    "minor",
    "minute",
    "miracle",
    "mirror",
    "misery",
    "miss",
    "mistake",
    "mix",
    "mixed",
    "mixture",
    "mobile",
    "model",
    "modify",
    "mom",
    "moment",
    "monitor",
    "monkey",
    "monster",
    "month",
    "moon",
    "moral",
    "more",
    "morning",
    "mosquito",
    "mother",
    "motion",
    "motor",
    "mountain",
    "mouse",
    "move",
    "movie",
    "much",
    "muffin",
    "mule",
    "multiply",
    "muscle",
    "museum",
    "mushroom",
    "music",
    "must",
    "mutual",
    "myself",
    "mystery",
    "myth",
    "naive",
    "name",
    "napkin",
    "narrow",
    "nasty",
    "nation",
    "nature",
    "near",
    "neck",
    "need",
    "negative",
    "neglect",
    "neither",
    "nephew",
    "nerve",
    "nest",
    "net",
    "network",
    "neutral",
    "never",
    "news",
    "next",
    "nice",
    "night",
    "noble",
    "noise",
    "nominee",
    "noodle",
    "normal",
    "north",
    "nose",
    "notable",
    "note",
    "nothing",
    "notice",
    "novel",
    "now",
    "nuclear",
    "number",
    "nurse",
    "nut",
    "oak",
    "obey",
    "object",
    "oblige",
    "obscure",
    "observe",
    "obtain",
    "obvious",
    "occur",
    "ocean",
    "october",
    "odor",
    "off",
    "offer",
    "office",
    "often",
    "oil",
    "okay",
    "old",
    "olive",
    "olympic",
    "omit",
    "once",
    "one",
    "onion",
    "online",
    "only",
    "open",
    "opera",
    "opinion",
    "oppose",
    "option",
    "orange",
    "orbit",
    "orchard",
    "order",
    "ordinary",
    "organ",
    "orient",
    "original",
    "orphan",
    "ostrich",
    "other",
    "outdoor",
    "outer",
    "output",
    "outside",
    "oval",
    "oven",
    "over",
    "own",
    "owner",
    "oxygen",
    "oyster",
    "ozone",
    "pact",
    "paddle",
    "page",
    "pair",
    "palace",
    "palm",
    "panda",
    "panel",
    "panic",
    "panther",
    "paper",
    "parade",
    "parent",
    "park",
    "parrot",
    "party",
    "pass",
    "patch",
    "path",
    "patient",
    "patrol",
    "pattern",
    "pause",
    "pave",
    "payment",
    "peace",
    "peanut",
    "pear",
    "peasant",
    "pelican",
    "pen",
    "penalty",
    "pencil",
    "people",
    "pepper",
    "perfect",
    "permit",
    "person",
    "pet",
    "phone",
    "photo",
    "phrase",
    "physical",
    "piano",
    "picnic",
    "picture",
    "piece",
    "pig",
    "pigeon",
    "pill",
    "pilot",
    "pink",
    "pioneer",
    "pipe",
    "pistol",
    "pitch",
    "pizza",
    "place",
    "planet",
    "plastic",
    "plate",
    "play",
    "please",
    "pledge",
    "pluck",
    "plug",
    "plunge",
    "poem",
    "poet",
    "point",
    "polar",
    "pole",
    "police",
    "pond",
    "pony",
    "pool",
    "popular",
    "portion",
    "position",
    "possible",
    "post",
    "potato",
    "pottery",
    "poverty",
    "powder",
    "power",
    "practice",
    "praise",
    "predict",
    "prefer",
    "prepare",
    "present",
    "pretty",
    "prevent",
    "price",
    "pride",
    "primary",
    "print",
    "priority",
    "prison",
    "private",
    "prize",
    "problem",
    "process",
    "produce",
    "profit",
    "program",
    "project",
    "promote",
    "proof",
    "property",
    "prosper",
    "protect",
    "proud",
    "provide",
    "public",
    "pudding",
    "pull",
    "pulp",
    "pulse",
    "pumpkin",
    "punch",
    "pupil",
    "puppy",
    "purchase",
    "purity",
    "purpose",
    "purse",
    "push",
    "put",
    "puzzle",
    "pyramid",
    "quality",
    "quantum",
    "quarter",
    "question",
    "quick",
    "quit",
    "quiz",
    "quote",
    "rabbit",
    "raccoon",
    "race",
    "rack",
    "radar",
    "radio",
    "rail",
    "rain",
    "raise",
    "rally",
    "ramp",
    "ranch",
    "random",
    "range",
    "rapid",
    "rare",
    "rate",
    "rather",
    "raven",
    "raw",
    "razor",
    "ready",
    "real",
    "reason",
    "rebel",
    "rebuild",
    "recall",
    "receive",
    "recipe",
    "record",
    "recycle",
    "reduce",
    "reflect",
    "reform",
    "refuse",
    "region",
    "regret",
    "regular",
    "reject",
    "relax",
    "release",
    "relief",
    "rely",
    "remain",
    "remember",
    "remind",
    "remove",
    "render",
    "renew",
    "rent",
    "reopen",
    "repair",
    "repeat",
    "replace",
    "report",
    "require",
    "rescue",
    "resemble",
    "resist",
    "resource",
    "response",
    "result",
    "retire",
    "retreat",
    "return",
    "reunion",
    "reveal",
    "review",
    "reward",
    "rhythm",
    "rib",
    "ribbon",
    "rice",
    "rich",
    "ride",
    "ridge",
    "rifle",
    "right",
    "rigid",
    "ring",
    "riot",
    "ripple",
    "risk",
    "ritual",
    "rival",
    "river",
    "road",
    "roast",
    "robot",
    "robust",
    "rocket",
    "romance",
    "roof",
    "rookie",
    "room",
    "rose",
    "rotate",
    "rough",
    "round",
    "route",
    "royal",
    "rubber",
    "rude",
    "rug",
    "rule",
    "run",
    "runway",
    "rural",
    "sad",
    "saddle",
    "sadness",
    "safe",
    "sail",
    "salad",
    "salmon",
    "salon",
    "salt",
    "salute",
    "same",
    "sample",
    "sand",
    "satisfy",
    "satoshi",
    "sauce",
    "sausage",
    "save",
    "say",
    "scale",
    "scan",
    "scare",
    "scatter",
    "scene",
    "scheme",
    "school",
    "science",
    "scissors",
    "scorpion",
    "scout",
    "scrap",
    "screen",
    "script",
    "scrub",
    "sea",
    "search",
    "season",
    "seat",
    "second",
    "secret",
    "section",
    "security",
    "seed",
    "seek",
    "segment",
    "select",
    "sell",
    "seminar",
    "senior",
    "sense",
    "sentence",
    "series",
    "service",
    "session",
    "settle",
    "setup",
    "seven",
    "shadow",
    "shaft",
    "shallow",
    "share",
    "shed",
    "shell",
    "sheriff",
    "shield",
    "shift",
    "shine",
    "ship",
    "shiver",
    "shock",
    "shoe",
    "shoot",
    "shop",
    "short",
    "shoulder",
    "shove",
    "shrimp",
    "shrug",
    "shuffle",
    "shy",
    "sibling",
    "sick",
    "side",
    "siege",
    "sight",
    "sign",
    "silent",
    "silk",
    "silly",
    "silver",
    "similar",
    "simple",
    "since",
    "sing",
    "siren",
    "sister",
    "situate",
    "six",
    "size",
    "skate",
    "sketch",
    "ski",
    "skill",
    "skin",
    "skirt",
    "skull",
    "slab",
    "slam",
    "sleep",
    "slender",
    "slice",
    "slide",
    "slight",
    "slim",
    "slogan",
    "slot",
    "slow",
    "slush",
    "small",
    "smart",
    "smile",
    "smoke",
    "smooth",
    "snack",
    "snake",
    "snap",
    "sniff",
    "snow",
    "soap",
    "soccer",
    "social",
    "sock",
    "soda",
    "soft",
    "solar",
    "soldier",
    "solid",
    "solution",
    "solve",
    "someone",
    "song",
    "soon",
    "sorry",
    "sort",
    "soul",
    "sound",
    "soup",
    "source",
    "south",
    "space",
    "spare",
    "spatial",
    "spawn",
    "speak",
    "special",
    "speed",
    "spell",
    "spend",
    "sphere",
    "spice",
    "spider",
    "spike",
    "spin",
    "spirit",
    "split",
    "spoil",
    "sponsor",
    "spoon",
    "sport",
    "spot",
    "spray",
    "spread",
    "spring",
    "spy",
    "square",
    "squeeze",
    "squirrel",
    "stable",
    "stadium",
    "staff",
    "stage",
    "stairs",
    "stamp",
    "stand",
    "start",
    "state",
    "stay",
    "steak",
    "steel",
    "stem",
    "step",
    "stereo",
    "stick",
    "still",
    "sting",
    "stock",
    "stomach",
    "stone",
    "stool",
    "story",
    "stove",
    "strategy",
    "street",
    "strike",
    "strong",
    "struggle",
    "student",
    "stuff",
    "stumble",
    "style",
    "subject",
    "submit",
    "subway",
    "success",
    "such",
    "sudden",
    "suffer",
    "sugar",
    "suggest",
    "suit",
    "summer",
    "sun",
    "sunny",
    "sunset",
    "super",
    "supply",
    "supreme",
    "sure",
    "surface",
    "surge",
    "surprise",
    "surround",
    "survey",
    "suspect",
    "sustain",
    "swallow",
    "swamp",
    "swap",
    "swarm",
    "swear",
    "sweet",
    "swift",
    "swim",
    "swing",
    "switch",
    "sword",
    "symbol",
    "symptom",
    "syrup",
    "system",
    "table",
    "tackle",
    "tag",
    "tail",
    "talent",
    "talk",
    "tank",
    "tape",
    "target",
    "task",
    "taste",
    "tattoo",
    "taxi",
    "teach",
    "team",
    "tell",
    "ten",
    "tenant",
    "tennis",
    "tent",
    "term",
    "test",
    "text",
    "thank",
    "that",
    "theme",
    "then",
    "theory",
    "there",
    "they",
    "thing",
    "this",
    "thought",
    "three",
    "thrive",
    "throw",
    "thumb",
    "thunder",
    "ticket",
    "tide",
    "tiger",
    "tilt",
    "timber",
    "time",
    "tiny",
    "tip",
    "tired",
    "tissue",
    "title",
    "toast",
    "tobacco",
    "today",
    "toddler",
    "toe",
    "together",
    "toilet",
    "token",
    "tomato",
    "tomorrow",
    "tone",
    "tongue",
    "tonight",
    "tool",
    "tooth",
    "top",
    "topic",
    "topple",
    "torch",
    "tornado",
    "tortoise",
    "toss",
    "total",
    "tourist",
    "toward",
    "tower",
    "town",
    "toy",
    "track",
    "trade",
    "traffic",
    "tragic",
    "train",
    "transfer",
    "trap",
    "trash",
    "travel",
    "tray",
    "treat",
    "tree",
    "trend",
    "trial",
    "tribe",
    "trick",
    "trigger",
    "trim",
    "trip",
    "trophy",
    "trouble",
    "truck",
    "true",
    "truly",
    "trumpet",
    "trust",
    "truth",
    "try",
    "tube",
    "tuition",
    "tumble",
    "tuna",
    "tunnel",
    "turkey",
    "turn",
    "turtle",
    "twelve",
    "twenty",
    "twice",
    "twin",
    "twist",
    "two",
    "type",
    "typical",
    "ugly",
    "umbrella",
    "unable",
    "unaware",
    "uncle",
    "uncover",
    "under",
    "undo",
    "unfair",
    "unfold",
    "unhappy",
    "uniform",
    "unique",
    "unit",
    "universe",
    "unknown",
    "unlock",
    "until",
    "unusual",
    "unveil",
    "update",
    "upgrade",
    "uphold",
    "upon",
    "upper",
    "upset",
    "urban",
    "urge",
    "usage",
    "use",
    "used",
    "useful",
    "useless",
    "usual",
    "utility",
    "vacant",
    "vacuum",
    "vague",
    "valid",
    "valley",
    "valve",
    "van",
    "vanish",
    "vapor",
    "various",
    "vast",
    "vault",
    "vehicle",
    "velvet",
    "vendor",
    "venture",
    "venue",
    "verb",
    "verify",
    "version",
    "very",
    "vessel",
    "veteran",
    "viable",
    "vibrant",
    "vicious",
    "victory",
    "video",
    "view",
    "village",
    "vintage",
    "violin",
    "virtual",
    "virus",
    "visa",
    "visit",
    "visual",
    "vital",
    "vivid",
    "vocal",
    "voice",
    "void",
    "volcano",
    "volume",
    "vote",
    "voyage",
    "wage",
    "wagon",
    "wait",
    "walk",
    "wall",
    "walnut",
    "want",
    "warfare",
    "warm",
    "warrior",
    "wash",
    "wasp",
    "waste",
    "water",
    "wave",
    "way",
    "wealth",
    "weapon",
    "wear",
    "weasel",
    "weather",
    "web",
    "wedding",
    "weekend",
    "weird",
    "welcome",
    "west",
    "wet",
    "whale",
    "what",
    "wheat",
    "wheel",
    "when",
    "where",
    "whip",
    "whisper",
    "wide",
    "width",
    "wife",
    "wild",
    "will",
    "win",
    "window",
    "wine",
    "wing",
    "wink",
    "winner",
    "winter",
    "wire",
    "wisdom",
    "wise",
    "wish",
    "witness",
    "wolf",
    "woman",
    "wonder",
    "wood",
    "wool",
    "word",
    "work",
    "world",
    "worry",
    "worth",
    "wrap",
    "wreck",
    "wrestle",
    "wrist",
    "write",
    "wrong",
    "yard",
    "year",
    "yellow",
    "you",
    "young",
    "youth",
    "zebra",
    "zero",
    "zone",
    "zoo"
  ];

  // impl/js/bip39.mjs
  var WORDS = null;
  function words() {
    if (WORDS) return WORDS;
    WORDS = WORDLIST_ENGLISH;
    if (WORDS.length !== 2048) throw new Error("wordlist must be exactly 2048 words");
    return WORDS;
  }
  var VALID_BITS = [128, 160, 192, 224, 256];
  var bits = (buf) => [...buf].map((b) => b.toString(2).padStart(8, "0")).join("");
  function nfkd(s, what = "text") {
    if (/^[\x20-\x7e]*$/.test(s)) return s;
    const folded = [...s].map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 65281 && cp <= 65374) return String.fromCharCode(cp - 65281 + 33);
      if (cp === 12288 || cp === 160) return " ";
      return ch;
    }).join("");
    if (/^[\x20-\x7e]*$/.test(folded)) return folded;
    const n = folded.normalize("NFKD");
    if (/^[\x20-\x7e]*$/.test(n)) return n;
    return n;
  }
  function fromEntropy(entropy) {
    const n = entropy.length * 8;
    if (!VALID_BITS.includes(n)) throw new Error(`entropy must be 16,20,24,28 or 32 bytes; got ${entropy.length}`);
    const bin = bits(entropy) + bits(sha256(entropy)).slice(0, n / 32);
    const w = words();
    return (bin.match(/.{11}/g) || []).map((c) => w[parseInt(c, 2)]).join(" ");
  }
  function toEntropy(mnemonic) {
    const parts = nfkd(mnemonic, "mnemonic").trim().split(/\s+/u).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(parts.length))
      throw new Error(`a mnemonic is 12,15,18,21 or 24 words; got ${parts.length}`);
    const w = words(), index = new Map(w.map((x, i) => [x, i]));
    let bin = "";
    for (const p of parts) {
      const i = index.get(p.toLowerCase());
      if (i === void 0) throw new Error(`not a BIP-39 word: "${p}"`);
      bin += i.toString(2).padStart(11, "0");
    }
    const entBits = Math.floor(parts.length * 11 * 32 / 33);
    const entropy = Uint8Array.from((bin.slice(0, entBits).match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
    const want = bits(sha256(entropy)).slice(0, parts.length * 11 - entBits);
    if (bin.slice(entBits) !== want)
      throw new Error("checksum does not match \u2014 a word is wrong or in the wrong place");
    return entropy;
  }
  var isValid = (m) => {
    try {
      toEntropy(m);
      return true;
    } catch {
      return false;
    }
  };
  function toSeed(mnemonic, passphrase = "") {
    return pbkdf2(
      sha512,
      fromUtf8(nfkd(mnemonic, "mnemonic")),
      fromUtf8("mnemonic" + nfkd(passphrase, "passphrase")),
      { c: 2048, dkLen: 64 }
    );
  }

  // src/bytes.ts
  var hexBytes = (hex) => hex.length === 0 ? [] : Array.from(fromHex(hex));
  var hexOf = (b) => toHex(Uint8Array.from(b));
  var utf8Bytes = (s) => Array.from(fromUtf8(s));
  var utf8Of = (b) => toUtf8(Uint8Array.from(b));
  var sha256Bytes = (b) => Array.from(sha256(Uint8Array.from(b)));
  var hash160Bytes = (b) => Array.from(hash160(Uint8Array.from(b)));
  var randomBytes = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)));
  var addressFromPubHex = (hex) => {
    const point = decodePoint(Uint8Array.from(hexBytes(hex)));
    if (point === null) throw new Error(`not a valid public key: ${hex.slice(0, 16)}\u2026`);
    return p2pkhAddress(serP(point));
  };
  var compressedPubKeyHex = (hex) => {
    const point = decodePoint(Uint8Array.from(hexBytes(hex)));
    if (point === null) throw new Error(`not a valid public key: ${hex.slice(0, 16)}\u2026`);
    return toHex(serP(point));
  };

  // impl/js/chain.mjs
  var MIN_REQUEST_GAP_MS = 350;
  var ChainError = class extends Error {
  };
  var RateLimiter = class {
    constructor(minGapMs = MIN_REQUEST_GAP_MS, sleep = defaultSleep) {
      this.minGapMs = minGapMs;
      this.sleep = sleep;
      this.chain = Promise.resolve();
    }
    run(fn) {
      return new Promise((resolve, reject) => {
        this.chain = this.chain.then(async () => {
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
          await this.sleep(this.minGapMs);
        });
      });
    }
  };
  var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var ChainHttp = class {
    /**
     * @param fetchImpl  defaults to the platform `fetch`
     * @param sleep      injectable so the suite does not spend real seconds proving the pacing
     */
    constructor({ fetchImpl, sleep = defaultSleep, minGapMs = MIN_REQUEST_GAP_MS, maxRetries = 3 } = {}) {
      this.fetchImpl = fetchImpl ?? (typeof fetch === "function" ? fetch.bind(globalThis) : null);
      this.sleep = sleep;
      this.minGapMs = minGapMs;
      this.maxRetries = maxRetries;
      this.limiters = /* @__PURE__ */ new Map();
    }
    /** ⚠ One queue per host. Two services throttle independently, so one queue would halve both. */
    limiter(url) {
      let host;
      try {
        host = new URL(url).host;
      } catch {
        throw new ChainError(`not a URL: ${url}`);
      }
      if (!host) throw new ChainError(`no host in URL: ${url}`);
      if (!this.limiters.has(host)) this.limiters.set(host, new RateLimiter(this.minGapMs, this.sleep));
      return this.limiters.get(host);
    }
    async request(url, init2) {
      if (this.fetchImpl === null) throw new ChainError("no fetch available and none was injected");
      const lim = this.limiter(url);
      for (let attempt = 0; ; attempt++) {
        const resp = await lim.run(() => this.fetchImpl(url, init2));
        if (resp.status !== 429 || attempt >= this.maxRetries) return resp;
        const after = resp.headers?.get?.("retry-after");
        const ms = after !== null && after !== void 0 && after !== "" && Number.isFinite(Number(after)) ? Number(after) * 1e3 : 500 * (attempt + 1);
        await this.sleep(Math.min(ms, 6e4));
      }
    }
    async json(url, init2) {
      const r = await this.request(url, init2);
      if (!r.ok) throw new ChainError(`${url} returned HTTP ${r.status}`);
      return r.json();
    }
  };

  // src/walletProvider.ts
  var WOC_BASE = typeof location !== "undefined" && location.hostname === "localhost" ? "/woc/v1/bsv/main" : "https://api.whatsonchain.com/v1/bsv/main";
  var BANANA_BASE = typeof location !== "undefined" && location.hostname === "localhost" ? "/banana/api/v1" : "https://bananablocks.com/api/v1";
  var BANANA_WOC_BASE = typeof location !== "undefined" && location.hostname === "localhost" ? "/banana/api/v1/bsv/main" : "https://bananablocks.com/api/v1/bsv/main";
  var CONFIRM_POLL_TRIES = 3;
  var CONFIRM_POLL_INTERVAL_MS = 15e3;
  var GATE_POLL_TRIES = 10;
  var GATE_POLL_INTERVAL_MS = 2e3;
  var chainHttp = new ChainHttp();
  var delay = (ms) => chainHttp.sleep(ms);
  function queuedFetch(url, init2) {
    return chainHttp.request(url, init2);
  }
  async function fetchWithRetry(url, init2) {
    return await chainHttp.request(url, init2);
  }
  var WalletProvider = class {
    // key: "txId:outputIndex"
    constructor(address2) {
      this.txCache = /* @__PURE__ */ new Map();
      // Parsed-tx cache: Tx.parse is O(tx size) and re-parsing a big file-bearing TX1 (e.g. an
      // app-snapshot collection, ~300 KB) on every meta/name/publisher lookup can freeze the page. A tx's bytes
      // never change once broadcast, so caching the parsed object (parsed once) is safe and removes the hot spot.
      this.parsedTxCache = /* @__PURE__ */ new Map();
      /**
       * v05.22: Local pending UTXO tracking for consecutive transfers.
       *
       * When we broadcast a TX, the change output won't appear in WoC's UTXO list
       * until the TX is confirmed. This prevents consecutive fragment transfers
       * because the second transfer can't find funding UTXOs.
       *
       * Solution: Track pending UTXOs locally and combine with confirmed UTXOs.
       */
      this.pendingUtxos = /* @__PURE__ */ new Map();
      // key: "txId:outputIndex"
      this.spentOutpoints = /* @__PURE__ */ new Set();
      this.address = address2;
    }
    getAddress() {
      return this.address;
    }
    // ── Wallet Operations (UTXO model) ─────────────────────────────
    /**
     * Get spendable UTXOs from WoC's mempool-aware `/unspent/all` endpoint.
     *
     * This endpoint returns BOTH confirmed and unconfirmed UTXOs (so funding can be spent
     * before it confirms), and flags outputs already spent by a mempool tx
     * (`isSpentInMempoolTx`) — which we exclude so we never build a `txn-mempool-conflict`
     * double-spend, even across page reloads (WoC is the source of truth for mempool spends).
     *
     * ⚠⚠ THE RANKING, CORRECTED. This said "WoC is the source of truth for mempool spends", with
     * `pendingUtxos`/`spentOutpoints` demoted to a supplement. That is right on a chain with
     * REPLACE-BY-FEE, where your own broadcast can be replaced underneath you, so the network's current
     * view outranks your memory of what you sent. This chain has FIRST-SEEN and no RBF: an accepted
     * transaction is final, our own record cannot be invalidated by a replacement, and it is the
     * RELIABLE half. The indexer's flag is the supplement.
     *
     * ⚠ The flag is kept because it covers what our own record cannot know - the same key in use on
     * another device, or a wallet restored with no local history - and it FAILS OPEN: a missing field
     * keeps the coin, because an indexer that drops a flag must not be able to freeze a wallet.
     */
    async getUtxos() {
      const address2 = this.getAddress();
      const mapRows = (data) => {
        const rows = Array.isArray(data?.result) ? data.result : Array.isArray(data) ? data : [];
        return rows.filter((u) => u.isSpentInMempoolTx !== true).map((u) => ({
          txId: u.tx_hash,
          outputIndex: u.tx_pos,
          satoshis: u.value,
          script: ""
        }));
      };
      const allResp = await fetchWithRetry(`${WOC_BASE}/address/${address2}/unspent/all`);
      if (!allResp.ok) throw new Error(`WoC UTXO fetch failed: ${allResp.status}`);
      const confirmedUtxos = mapRows(await allResp.json());
      let unconfirmedUtxos = [];
      try {
        const ucResp = await fetchWithRetry(`${WOC_BASE}/address/${address2}/unconfirmed/unspent`);
        if (ucResp.ok) unconfirmedUtxos = mapRows(await ucResp.json());
      } catch {
      }
      const seen = /* @__PURE__ */ new Set();
      const onchain = [];
      for (const u of [...confirmedUtxos, ...unconfirmedUtxos]) {
        const k = `${u.txId}:${u.outputIndex}`;
        if (seen.has(k)) continue;
        seen.add(k);
        onchain.push(u);
      }
      const isSpent = (u) => this.spentOutpoints.has(`${u.txId}:${u.outputIndex}`);
      for (const u of onchain) this.pendingUtxos.delete(`${u.txId}:${u.outputIndex}`);
      const available = onchain.filter((u) => !isSpent(u));
      const pending = Array.from(this.pendingUtxos.values()).filter((u) => !isSpent(u));
      console.debug(`getUtxos: ${onchain.length} on-chain (mempool-aware), ${this.spentOutpoints.size} spent locally, ${pending.length} pending = ${available.length + pending.length} available`);
      return [...available, ...pending];
    }
    /**
     * Register a pending transaction for local UTXO tracking.
     *
     * Call this after broadcasting a TX to enable consecutive transfers
     * before the TX is confirmed.
     *
     * @param txId - The broadcast transaction ID
     * @param spentInputs - Outpoints consumed by this TX [{txId, outputIndex}]
     * @param changeOutput - Change output created by this TX (if any)
     */
    registerPendingTx(txId, spentInputs, changeOutput) {
      for (const input of spentInputs) {
        const key2 = `${input.txId}:${input.outputIndex}`;
        this.spentOutpoints.add(key2);
        this.pendingUtxos.delete(key2);
      }
      if (changeOutput && changeOutput.satoshis > 0) {
        const key2 = `${txId}:${changeOutput.outputIndex}`;
        this.pendingUtxos.set(key2, {
          txId,
          outputIndex: changeOutput.outputIndex,
          satoshis: changeOutput.satoshis,
          script: ""
        });
        console.debug(`registerPendingTx: Added pending UTXO ${key2.slice(0, 16)}... (${changeOutput.satoshis} sats)`);
      }
      console.debug(`registerPendingTx: TX ${txId.slice(0, 12)}... spent ${spentInputs.length} inputs, pending UTXOs: ${this.pendingUtxos.size}`);
    }
    /**
     * Clear spent outpoints for a confirmed transaction.
     *
     * Call this when a pending TX is confirmed to clean up tracking state.
     * Note: Pending UTXOs are auto-cleaned in getUtxos() when they appear confirmed.
     */
    clearConfirmedSpends(spentInputs) {
      for (const input of spentInputs) {
        const key2 = `${input.txId}:${input.outputIndex}`;
        this.spentOutpoints.delete(key2);
      }
    }
    async getBalance() {
      const utxos = await this.getUtxos();
      return utxos.reduce((sum, u) => sum + u.satoshis, 0);
    }
    // ── Broadcasting ──────────────────────────────────────────────
    /** POST the same signed tx to both relays; resolves with the name of the FIRST to accept, rejects
     *  (AggregateError) only if ALL reject. Shared by the initial broadcast and the orphan-guard re-broadcast. */
    relayBroadcast(rawHex) {
      const relays = [
        { name: "WoC", url: `${WOC_BASE}/tx/raw`, body: { txhex: rawHex } },
        { name: "BananaBlocks", url: `${BANANA_BASE}/tx/broadcast`, body: { rawtx: rawHex } }
      ];
      return Promise.any(relays.map(async (r) => {
        const resp = await queuedFetch(r.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(r.body)
        });
        if (!resp.ok) throw new Error(`${r.name} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        return r.name;
      }));
    }
    async broadcast(rawHex, opts = {}) {
      const txId = Tx.parse(rawHex).txid();
      try {
        const winner = await this.relayBroadcast(rawHex);
        console.info(`[broadcast] ${txId} accepted by ${winner}`);
      } catch (agg) {
        const errs = agg?.errors?.map((e) => String(e?.message ?? e)) ?? [String(agg)];
        throw new Error(`Broadcast rejected by all relays (${txId}): ${errs.join(" | ")}`);
      }
      this.txCache.set(txId, rawHex);
      if (opts.awaitSeen) await this.awaitInMempool(txId, rawHex);
      else void this.confirmLanded(txId, rawHex).catch(() => {
      });
      return txId;
    }
    /** Which relay (if any) currently reports this tx as present (mempool or mined). BananaBlocks is checked first —
     *  it's independent and non-pruning, so it holds the more complete mempool view. */
    async visibleOn(txId) {
      const relays = [
        ["BananaBlocks", `${BANANA_BASE}/tx/${txId}`],
        ["WoC", `${WOC_BASE}/tx/${txId}/hex`]
      ];
      const seen = await Promise.all(relays.map(async ([name, url]) => {
        try {
          return (await fetchWithRetry(url)).ok ? name : null;
        } catch {
          return null;
        }
      }));
      return seen.find(Boolean) ?? null;
    }
    /** Poll the relays until a just-broadcast tx is visible; if neither reports it after a short grace window,
     *  re-broadcast once. Non-blocking and best-effort — the caller already holds the deterministic txid. Used as
     *  the background orphan-guard for standalone txs (those with no child spending them in the same batch). */
    async confirmLanded(txId, rawHex) {
      for (let i = 0; i < CONFIRM_POLL_TRIES; i++) {
        await delay(CONFIRM_POLL_INTERVAL_MS);
        const on = await this.visibleOn(txId);
        if (on) {
          console.info(`[broadcast] ${txId} confirmed live in mempool (seen by ${on})`);
          return;
        }
      }
      const secs = Math.round(CONFIRM_POLL_TRIES * CONFIRM_POLL_INTERVAL_MS / 1e3);
      console.warn(`[broadcast] ${txId} not visible on any relay after ~${secs}s \u2014 re-broadcasting (possible ARC orphan, arc #1006)`);
      try {
        const w = await this.relayBroadcast(rawHex);
        console.info(`[broadcast] ${txId} re-broadcast, accepted by ${w}`);
      } catch {
        console.error(`[broadcast] ${txId} re-broadcast rejected by all relays`);
      }
    }
    /** BLOCKING parent-tx gate: wait until txId is visible in a relay mempool so a child tx can safely spend its
     *  output. Polls on a fast cadence (a just-accepted tx usually surfaces within a second or two); the first check
     *  is immediate, so the common case returns near-instantly. If it stalls for a full window, re-broadcast once
     *  (idempotent — same txid, no double-spend) then poll again — this recovers the ARC-orphan case that first
     *  bit the suited-up mint. Throws if it never appears, so the caller aborts before broadcasting the child (no
     *  orphaned child tx). SPV: mempool visibility is all the child needs — no block wait. */
    async awaitInMempool(txId, rawHex) {
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < GATE_POLL_TRIES; i++) {
          const on = await this.visibleOn(txId);
          if (on) {
            console.info(`[broadcast] parent ${txId} in mempool (seen by ${on}) \u2014 child tx clear to broadcast`);
            return;
          }
          await delay(GATE_POLL_INTERVAL_MS);
        }
        if (round === 0) {
          const secs = Math.round(GATE_POLL_TRIES * GATE_POLL_INTERVAL_MS / 1e3);
          console.warn(`[broadcast] parent ${txId} not in any mempool after ~${secs}s \u2014 re-broadcasting (possible ARC orphan, arc #1006)`);
          try {
            const w = await this.relayBroadcast(rawHex);
            console.info(`[broadcast] parent ${txId} re-broadcast, accepted by ${w}`);
          } catch {
          }
        }
      }
      throw new Error(`Parent tx ${txId} never appeared in a relay mempool \u2014 aborting before the dependent tx to avoid "Missing inputs". Please retry the mint.`);
    }
    // ── Raw Transactions ──────────────────────────────────────────
    async getRawTransaction(txId) {
      const cached = this.txCache.get(txId);
      if (cached) return cached;
      const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/hex`);
      if (!resp.ok) throw new Error(`WoC raw TX fetch failed: ${resp.status}`);
      const hex = await resp.text();
      this.txCache.set(txId, hex);
      return hex;
    }
    async getSourceTransaction(txId) {
      const cached = this.parsedTxCache.get(txId);
      if (cached) return cached;
      const hex = await this.getRawTransaction(txId);
      const tx = Tx.parse(hex);
      this.parsedTxCache.set(txId, tx);
      return tx;
    }
    /**
     * Fetch ONE output's locking-script hex via WoC, STREAMING the body and bailing the moment it exceeds
     * `maxBytes` — so the sales page can read a collection's small storefront/template outputs without pulling
     * a large embedded content file (e.g. a 40 MB audio track). Returns the hex; the sentinel 'oversized' if it
     * blew the cap (skipped without downloading the body); or null if the output doesn't exist (past the last
     * index). Hex is 2 chars/byte, so the byte cap is doubled internally.
     */
    async getOutputScriptHexCapped(txId, index, maxBytes = 512 * 1024) {
      const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/out/${index}/hex`);
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error(`WoC output fetch failed: ${resp.status}`);
      const capHex = maxBytes * 2;
      const cl = Number(resp.headers.get("content-length") ?? 0);
      if (cl > capHex) {
        try {
          await resp.body?.cancel();
        } catch {
        }
        return "oversized";
      }
      const reader = resp.body?.getReader();
      if (reader == null) {
        const t = (await resp.text()).trim();
        return t.length > capHex ? "oversized" : t || null;
      }
      const chunks = [];
      let received = 0;
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > capHex) {
          try {
            await reader.cancel();
          } catch {
          }
          return "oversized";
        }
        chunks.push(value);
      }
      let total = 0;
      for (const c of chunks) total += c.length;
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      const hex = new TextDecoder().decode(buf).trim();
      return hex.length === 0 ? null : hex;
    }
    // ── Block Headers (feeds into SPV verification) ───────────────
    /** Relay-reported confirmation of a tx: its block height + block time (unix seconds), or null if unconfirmed
     *  (mempool) or not found. For provenance display only — not an SPV proof (use getMerkleProof for that).
     *  Prefers BananaBlocks (GorillaPool — independent + non-pruning, so a more complete/reliable index than WoC,
     *  which now sits behind the BSVA/pruning landscape), falling back to WoC if BananaBlocks is unavailable. */
    async getTxConfirmation(txId) {
      try {
        const resp2 = await fetchWithRetry(`${BANANA_BASE}/tx/${txId}`);
        if (resp2.ok) {
          const d2 = await resp2.json();
          const h2 = d2?.block_height ?? 0;
          return h2 > 0 ? { blockHeight: h2, time: d2?.block_time ?? 0 } : null;
        }
      } catch {
      }
      const resp = await fetchWithRetry(`${WOC_BASE}/tx/hash/${txId}`);
      if (!resp.ok) return null;
      const d = await resp.json();
      const h = d?.blockheight ?? 0;
      if (h <= 0) return null;
      return { blockHeight: h, time: d?.blocktime ?? d?.time ?? 0 };
    }
    /** Current chain tip height (for approximate time-bucketing of activity by block-height delta). */
    async getChainHeight() {
      const resp = await fetchWithRetry(`${WOC_BASE}/chain/info`);
      if (!resp.ok) throw new Error(`WoC chain info fetch failed: ${resp.status}`);
      const data = await resp.json();
      return data?.blocks ?? 0;
    }
    async getBlockHeader(height) {
      const hashResp = await fetchWithRetry(`${WOC_BASE}/block/height/${height}`);
      if (!hashResp.ok) throw new Error(`WoC block height fetch failed: ${hashResp.status}`);
      const hashBody = await hashResp.text();
      let blockHash;
      try {
        const parsed = JSON.parse(hashBody);
        blockHash = typeof parsed === "string" ? parsed : parsed.hash;
      } catch {
        blockHash = hashBody.replace(/"/g, "");
      }
      try {
        const parsed = JSON.parse(hashBody);
        if (typeof parsed === "object" && parsed.merkleroot) {
          return {
            height,
            merkleRoot: parsed.merkleroot,
            hash: parsed.hash,
            timestamp: parsed.time,
            prevHash: parsed.previousblockhash
          };
        }
      } catch {
      }
      const headerResp = await fetchWithRetry(`${WOC_BASE}/block/${blockHash}/header`);
      if (!headerResp.ok) throw new Error(`WoC block header fetch failed: ${headerResp.status}`);
      const hdr = await headerResp.json();
      return {
        height,
        merkleRoot: hdr.merkleroot,
        hash: hdr.hash,
        timestamp: hdr.time,
        prevHash: hdr.previousblockhash
      };
    }
    // ── Address History ───────────────────────────────────────────
    async getAddressHistory(address2 = this.getAddress()) {
      const resp = await fetchWithRetry(`${WOC_BASE}/address/${address2}/history`);
      if (resp.status === 404) return [];
      if (!resp.ok) throw new Error(`WoC history fetch failed: ${resp.status}`);
      const data = await resp.json();
      if (!Array.isArray(data)) return [];
      return data.map((entry) => ({
        txId: entry.tx_hash,
        blockHeight: entry.height ?? 0
      }));
    }
    // ── Script-hash UTXOs (find covenant outputs not at our address) ──
    /**
     * Unspent outputs paying a given script hash. Edition covenant outputs are locked to an owner pubkey
     * embedded in a custom script, NOT to a P2PKH address, so they aren't in any address's UTXO set — but
     * their exact script is deterministically derivable (covenant.buildHolderEditionScript), and WoC indexes
     * by script hash. This is how the sales page resolves a holder's current spendable edition.
     *
     * Uses the MEMPOOL-AWARE `/unspent/all` (confirmed + unconfirmed, flags mempool-spent) so a just-acquired
     * edition — and the note/bonus that rode in on its tx — resolves immediately, before confirmation; falls
     * back to the confirmed-only `/unspent` if `/all` isn't available. `scriptHash` is SHA-256(scriptBytes)
     * byte-reversed (Electrum/WoC convention).
     */
    async getUnspentByScriptHash(scriptHash) {
      const mapRows = (data) => {
        const rows = Array.isArray(data?.result) ? data.result : Array.isArray(data) ? data : [];
        return rows.filter((u) => u.isSpentInMempoolTx !== true).map((u) => ({ txId: u.tx_hash, outputIndex: u.tx_pos, satoshis: u.value, script: "", height: u.height }));
      };
      const all = await fetchWithRetry(`${WOC_BASE}/script/${scriptHash}/unspent/all`);
      if (all.ok) return mapRows(await all.json());
      const resp = await fetchWithRetry(`${WOC_BASE}/script/${scriptHash}/unspent`);
      if (!resp.ok) throw new Error(`WoC script-unspent fetch failed: ${resp.status}`);
      return mapRows(await resp.json());
    }
    /**
     * Mempool-aware txids touching an address, via `/unspent/all` (confirmed + unconfirmed outputs).
     * A just-broadcast tx's change output appears here before it confirms, so this surfaces a freshly
     * published seller-note (its change pays the seller's address) that `/history` hasn't indexed yet.
     */
    async getRecentTxIdsForAddress(address2) {
      const out = /* @__PURE__ */ new Set();
      try {
        const r = await fetchWithRetry(`${WOC_BASE}/address/${address2}/unspent/all`);
        if (r.ok) {
          const data = await r.json();
          const rows = Array.isArray(data?.result) ? data.result : Array.isArray(data) ? data : [];
          for (const u of rows) if (u.tx_hash) out.add(u.tx_hash);
        }
      } catch {
      }
      return [...out];
    }
    // ── Merkle Proofs (feeds into proof chain construction) ───────
    async getMerkleProof(txId) {
      return await this.merkleProofBanana(txId) ?? await this.merkleProofWoC(txId);
    }
    /** TSC `nodes` + tx `index` → L/R sibling path ('*' = duplicate-up, no sibling). Shared by both sources. */
    tscPath(nodes, index) {
      const path = [];
      let idx = index;
      for (const node of nodes) {
        if (node === "*") {
          idx = idx >> 1;
          continue;
        }
        path.push({ hash: node, position: idx % 2 === 0 ? "R" : "L" });
        idx = idx >> 1;
      }
      return path;
    }
    /** BananaBlocks: tsc `target` is the MERKLE ROOT. Take the block hash from the native tx record, read the
     *  header (trusted source of merkleroot + height), and require the header's root to equal the proof's target
     *  — so the path is anchored to a header, not to the relay's self-reported root. */
    async merkleProofBanana(txId) {
      try {
        const pResp = await fetchWithRetry(`${BANANA_WOC_BASE}/tx/${txId}/proof/tsc`);
        if (!pResp.ok) return null;
        const raw = await pResp.json();
        const data = Array.isArray(raw) ? raw[0] : raw;
        if (!data?.target) return null;
        const path = this.tscPath(data.nodes ?? [], data.index ?? 0);
        const txResp = await fetchWithRetry(`${BANANA_BASE}/tx/${txId}`);
        if (!txResp.ok) return null;
        const blockHash = (await txResp.json())?.block_hash;
        if (!blockHash) return null;
        const hResp = await fetchWithRetry(`${BANANA_WOC_BASE}/block/${blockHash}/header`);
        if (!hResp.ok) return null;
        const header = await hResp.json();
        if (header?.merkleroot !== data.target) {
          console.debug(`getMerkleProof(banana): merkleroot mismatch for ${txId.slice(0, 12)}\u2026`);
          return null;
        }
        return { txId, blockHeight: header.height, merkleRoot: header.merkleroot, path };
      } catch {
        return null;
      }
    }
    /** WoC: tsc `target` IS the block hash → its header gives merkleroot + height directly. */
    async merkleProofWoC(txId) {
      const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/proof/tsc`);
      if (!resp.ok) {
        console.debug(`getMerkleProof(woc): ${resp.status} for ${txId.slice(0, 12)}\u2026`);
        return null;
      }
      const raw = await resp.json();
      const data = Array.isArray(raw) ? raw[0] : raw;
      if (!data?.target) return null;
      const path = this.tscPath(data.nodes ?? [], data.index ?? 0);
      const headerResp = await fetchWithRetry(`${WOC_BASE}/block/${data.target}/header`);
      if (!headerResp.ok) return null;
      const header = await headerResp.json();
      return { txId, blockHeight: header.height, merkleRoot: header.merkleroot, path };
    }
  };

  // src/pharlapStore.ts
  var STORAGE_KEY = "p2:tokens";
  function outpointKey(t) {
    return `${t.txId}:${t.outputIndex}`;
  }
  function migrateLegacyKeys(t) {
    const legacy = t;
    if (t.publisherPubKeyHashHex === void 0 && legacy.creatorPubKeyHashHex !== void 0) {
      t.publisherPubKeyHashHex = legacy.creatorPubKeyHashHex;
    }
    if (t.publisherFeeSats === void 0 && legacy.creatorFeeSats !== void 0) {
      t.publisherFeeSats = legacy.creatorFeeSats;
    }
    return t;
  }
  var PharLapStore = class {
    constructor(kv) {
      const fallback = globalThis.localStorage;
      if (kv == null && fallback == null) {
        throw new Error("PharLapStore: no KV store available (localStorage missing)");
      }
      this.kv = kv ?? fallback;
    }
    list() {
      const raw = this.kv.getItem(STORAGE_KEY);
      if (raw == null || raw === "") return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(migrateLegacyKeys) : [];
      } catch {
        return [];
      }
    }
    write(tokens) {
      this.kv.setItem(STORAGE_KEY, JSON.stringify(tokens));
    }
    /** Empty the cache (e.g. on wallet switch — holdings are rebuildable from the WIF + chain). */
    clear() {
      this.write([]);
    }
    /** Add a token if not already present (dedup by outpoint). Returns true if added. */
    add(token) {
      const tokens = this.list();
      const k = outpointKey(token);
      if (tokens.some((t) => outpointKey(t) === k)) return false;
      tokens.push({
        txId: token.txId,
        outputIndex: token.outputIndex,
        collectionId: token.collectionId,
        stateData: token.stateData,
        collectionName: token.collectionName,
        status: "active",
        addedAt: token.addedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
        kind: token.kind,
        lockHex: token.lockHex,
        publisherPubKeyHashHex: token.publisherPubKeyHashHex,
        publisherPubKeyHex: token.publisherPubKeyHex,
        publisherFeeSats: token.publisherFeeSats,
        holderFeeSats: token.holderFeeSats,
        // Previously dropped on the floor: these were passed by storeEdition but never persisted, so the bond
        // amount / seller note / bonus were lost on reload. Persist them.
        tokenSats: token.tokenSats,
        sellerNote: token.sellerNote,
        bonusKind: token.bonusKind,
        bonusValue: token.bonusValue
      });
      this.write(tokens);
      return true;
    }
    /** Cache the publisher's recovered full pubkey on every held copy of a collection (set lazily after a
     *  TX1 input lookup). Keyed by collectionId since all editions of a collection share one publisher. */
    setPublisherPubKey(collectionId, publisherPubKeyHex) {
      const tokens = this.list().map((t) => t.collectionId === collectionId ? { ...t, publisherPubKeyHex } : t);
      this.write(tokens);
    }
    /** Update the cached collection name of a stored token (e.g. once resolved from TX1). */
    setCollectionName(txId, outputIndex, collectionName) {
      const k = outpointKey({ txId, outputIndex });
      const tokens = this.list().map((t) => outpointKey(t) === k ? { ...t, collectionName } : t);
      this.write(tokens);
    }
    /** Mark a token as sent (spent in a transfer); kept for history. */
    markSent(txId, outputIndex) {
      const k = outpointKey({ txId, outputIndex });
      const tokens = this.list().map((t) => outpointKey(t) === k ? { ...t, status: "sent" } : t);
      this.write(tokens);
    }
    remove(txId, outputIndex) {
      const k = outpointKey({ txId, outputIndex });
      this.write(this.list().filter((t) => outpointKey(t) !== k));
    }
    /** Active (held) tokens. */
    active() {
      return this.list().filter((t) => t.status === "active");
    }
  };

  // impl/js/coins.mjs
  var SAT_PER_KB = 100;
  var P2PKH_INPUT = 148;
  function inputSize(u) {
    if (u.unlockingSize === void 0) return P2PKH_INPUT;
    const n = u.unlockingSize;
    if (n < 0) throw new Error("an unlocking script cannot have negative size");
    return 32 + 4 + varint(n).length + n + 4;
  }
  var outputSize = (script) => 8 + varint(script.length).length + script.length;
  var fee = (size, satPerKb = SAT_PER_KB) => Math.ceil(size * satPerKb / 1e3);
  function applyFee(tx, { inputValues, unlockingSizes = [], changeVout, satPerKb = SAT_PER_KB }) {
    if (inputValues.length !== tx.inputs.length)
      throw new Error(`${inputValues.length} input values for ${tx.inputs.length} inputs`);
    if (tx.outputs[changeVout] === void 0) throw new Error(`no output at changeVout ${changeVout}`);
    let size = 8 + varint(tx.inputs.length).length + varint(tx.outputs.length).length;
    tx.inputs.forEach((_, i) => {
      size += inputSize({ unlockingSize: unlockingSizes[i] ?? P2PKH_INPUT - 41 });
    });
    for (const o of tx.outputs) size += outputSize(o.script);
    const f = fee(size, satPerKb);
    let totalIn = 0;
    for (const v of inputValues) {
      if (!Number.isInteger(v) || v < 0) throw new Error(`an input value must be a whole number, got ${v}`);
      totalIn += v;
    }
    let spent = 0;
    tx.outputs.forEach((o, i) => {
      if (i !== changeVout) spent += o.value;
    });
    const change = totalIn - spent - f;
    if (change < 0)
      throw new Error(`insufficient funds: ${totalIn} in, ${spent} out, ${f} fee - short by ${-change} satoshis`);
    tx.outputs[changeVout].value = change;
    return { fee: f, change, size };
  }

  // src/pushDrop.ts
  var u8 = (d) => Uint8Array.from(d);
  var arr = (b) => Array.from(b);
  function minimalPushChunk(data) {
    if (data.length === 0) return { op: OP.OP_0 };
    if (data.length === 1 && data[0] === 0) return { op: OP.OP_0 };
    if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return { op: 80 + data[0] };
    if (data.length === 1 && data[0] === 129) return { op: OP.OP_1NEGATE };
    if (data.length <= 75) return { op: data.length, data };
    if (data.length <= 255) return { op: OP.OP_PUSHDATA1, data };
    if (data.length <= 65535) return { op: OP.OP_PUSHDATA2, data };
    return { op: OP.OP_PUSHDATA4, data };
  }
  function appendDrops(chunks, count) {
    let notYetDropped = count;
    while (notYetDropped > 1) {
      chunks.push({ op: OP.OP_2DROP });
      notYetDropped -= 2;
    }
    if (notYetDropped === 1) chunks.push({ op: OP.OP_DROP });
  }
  function lock(pubKeyHex2, fields) {
    const pub = arr(fromHex(pubKeyHex2));
    if (pub.length !== 33 && pub.length !== 65) {
      throw new Error(`pushDrop.lock: public key must be 33 or 65 bytes, got ${pub.length}`);
    }
    const chunks = [
      { op: pub.length, data: pub },
      { op: OP.OP_CHECKSIG },
      ...fields.map(minimalPushChunk)
    ];
    appendDrops(chunks, fields.length);
    return new LockingScript(chunks.map((c) => ({ op: c.op, data: c.data === void 0 ? void 0 : u8(c.data) })));
  }
  function unlockScript(privKey, tx, inputIndex, lockingScript, sourceSatoshis, options = {}) {
    const { signOutputs = "all", anyoneCanPay = false } = options;
    let scope = SIGHASH.FORKID;
    if (signOutputs === "all") scope |= SIGHASH.ALL;
    else if (signOutputs === "none") scope |= SIGHASH.NONE;
    else if (signOutputs === "single") scope |= SIGHASH.SINGLE;
    if (anyoneCanPay) scope |= SIGHASH.ANYONECANPAY;
    if (tx.inputs[inputIndex] === void 0) throw new Error(`pushDrop.unlockScript: no input at ${inputIndex}`);
    if (!Number.isInteger(sourceSatoshis) || sourceSatoshis < 0) {
      throw new Error("pushDrop.unlockScript: sourceSatoshis must be a whole number of satoshis");
    }
    const digest = dsha256(preimage(tx, inputIndex, lockingScript, sourceSatoshis, scope));
    const der = sign(privKey, digest, { lowS: true });
    const sig = concat(der, Uint8Array.of(scope));
    return new UnlockingScript([{ op: sig.length, data: sig }]);
  }
  var UNLOCK_SIZE = 73;
  function decode(script) {
    const chunks = script.chunks;
    if (chunks == null || chunks.length < 2) return null;
    const pubData = chunks[0].data;
    if (pubData == null || pubData.length !== 33 && pubData.length !== 65) return null;
    if (chunks[1].op !== OP.OP_CHECKSIG) return null;
    let pubKeyHex2;
    try {
      pubKeyHex2 = toHex(serP(decodePoint(pubData)));
    } catch {
      return null;
    }
    const fields = [];
    for (let i = 2; i < chunks.length; i++) {
      const op3 = chunks[i].op;
      if (op3 === OP.OP_DROP || op3 === OP.OP_2DROP) break;
      let data = chunks[i].data === void 0 ? [] : arr(chunks[i].data);
      if (data.length === 0) {
        if (op3 >= 81 && op3 <= 96) data = [op3 - 80];
        else if (op3 === OP.OP_0) data = [0];
        else if (op3 === OP.OP_1NEGATE) data = [129];
        else return null;
      }
      fields.push(data);
    }
    return { fields, pubKeyHex: pubKeyHex2 };
  }

  // src/tokenCodec.ts
  var P_PREFIX = [80];
  var P_VERSION = 3;
  var RECORD_TEMPLATE = 1;
  var RECORD_TOKEN = 2;
  var RECORD_FILE = 3;
  var RECORD_MESSAGE = 4;
  var RECORD_STOREFRONT = 6;
  var RECORD_NOTE = 7;
  var RECORD_PROFILE = 8;
  var RECORD_CONFIG = 9;
  var RECORD_PREVIEW = 10;
  var RECORD_MOCKUP = 11;
  var RESTRICTION_FUNGIBLE = 1;
  var RESTRICTION_REPLICABLE = 2;
  var RESTRICTION_TRACK_TRANSFERS = 4;
  var RESTRICTION_ENCRYPTED = 8;
  var RESTRICTION_COMPRESSED = 16;
  function hexToBytes(hex) {
    return hex.length === 0 ? [] : hexBytes(hex);
  }
  function bytesToHex(bytes) {
    return hexOf(bytes);
  }
  function utf8ToBytes2(s) {
    return Array.from(new TextEncoder().encode(s));
  }
  function bytesToUtf8(bytes) {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  function isEmptyOrZero(bytes) {
    return bytes.length === 0 || bytes.length === 1 && bytes[0] === 0;
  }
  function encodeTokenFields(data) {
    return [
      P_PREFIX,
      [P_VERSION],
      [RECORD_TOKEN],
      hexToBytes(data.tx1Ref),
      hexToBytes(data.stateData)
    ];
  }
  function decodeTokenFields(fields) {
    if (fields.length < 5) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_TOKEN) return null;
    if (fields[3].length !== 32) return null;
    return {
      tx1Ref: bytesToHex(fields[3]),
      stateData: bytesToHex(fields[4])
    };
  }
  function buildTokenScript(ownerPubKeyHex, data) {
    return lock(ownerPubKeyHex, encodeTokenFields(data));
  }
  function parseTokenScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeTokenFields(d.fields);
    if (fields == null) return null;
    return { ownerPubKeyHex: d.pubKeyHex, fields };
  }
  function encodeMessageFields(data) {
    return [
      P_PREFIX,
      [P_VERSION],
      [RECORD_MESSAGE],
      hexToBytes(data.ref),
      data.envelope
    ];
  }
  function decodeMessageFields(fields) {
    if (fields.length < 5) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_MESSAGE) return null;
    if (fields[3].length !== 32) return null;
    return {
      ref: bytesToHex(fields[3]),
      envelope: fields[4]
    };
  }
  function buildMessageScript(recipientPubKeyHex, data) {
    return lock(recipientPubKeyHex, encodeMessageFields(data));
  }
  function parseMessageScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeMessageFields(d.fields);
    if (fields == null) return null;
    return { recipientPubKeyHex: d.pubKeyHex, fields };
  }
  var TEMPLATE_TAG_LICENSE = 1;
  var TEMPLATE_TAG_LICENSE_REF = 2;
  var TEMPLATE_LICENSE_MAX = 30;
  function encodeTemplateFields(data) {
    const fields = [
      P_PREFIX,
      [P_VERSION],
      [RECORD_TEMPLATE],
      utf8ToBytes2(data.tokenName),
      hexToBytes(data.tokenRules),
      hexToBytes(data.covenantScript)
    ];
    if (data.fileHash != null && data.fileHash.length > 0) {
      fields.push(hexToBytes(data.fileHash));
      if (data.wrappedKey != null && data.keySalt != null) {
        fields.push(data.wrappedKey, data.keySalt);
      }
    }
    if (data.license != null && data.license.length > 0) {
      const code = utf8ToBytes2(data.license);
      if (code.length > TEMPLATE_LICENSE_MAX) throw new Error(`license code too long (${code.length} > ${TEMPLATE_LICENSE_MAX} bytes)`);
      fields.push([TEMPLATE_TAG_LICENSE, ...code]);
    }
    if (data.licenseRef != null && data.licenseRef.length > 0) {
      fields.push([TEMPLATE_TAG_LICENSE_REF, ...hexToBytes(data.licenseRef)]);
    }
    return fields;
  }
  function decodeTemplateFields(fields) {
    if (fields.length < 6) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_TEMPLATE) return null;
    const result = {
      tokenName: bytesToUtf8(fields[3]),
      tokenRules: bytesToHex(fields[4]),
      // Empty covenant normalizes to "00" via OP_0; treat that as "no covenant".
      covenantScript: isEmptyOrZero(fields[5]) ? "" : bytesToHex(fields[5])
    };
    let i = 6;
    if (fields.length > i && fields[i].length === 32) {
      result.fileHash = bytesToHex(fields[i]);
      i++;
      if (decodeTokenRules(result.tokenRules).isEncrypted && fields.length >= i + 2) {
        result.wrappedKey = fields[i];
        result.keySalt = fields[i + 1];
        i += 2;
      }
    }
    for (; i < fields.length; i++) {
      const f = fields[i];
      if (f.length < 1) continue;
      if (f[0] === TEMPLATE_TAG_LICENSE) result.license = bytesToUtf8(f.slice(1));
      else if (f[0] === TEMPLATE_TAG_LICENSE_REF) result.licenseRef = bytesToHex(f.slice(1));
    }
    return result;
  }
  function buildTemplateScript(publisherPubKeyHex, data) {
    return lock(publisherPubKeyHex, encodeTemplateFields(data));
  }
  function parseTemplateScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeTemplateFields(d.fields);
    if (fields == null) return null;
    return { publisherPubKeyHex: d.pubKeyHex, fields };
  }
  function encodeFileFields(data) {
    return [
      P_PREFIX,
      [P_VERSION],
      [RECORD_FILE],
      utf8ToBytes2(data.mimeType),
      utf8ToBytes2(data.fileName),
      data.fileBytes
    ];
  }
  function decodeFileFields(fields) {
    if (fields.length < 6) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_FILE) return null;
    return {
      mimeType: bytesToUtf8(fields[3]),
      fileName: bytesToUtf8(fields[4]),
      fileBytes: fields[5]
    };
  }
  function buildFileScript(publisherPubKeyHex, data) {
    return lock(publisherPubKeyHex, encodeFileFields(data));
  }
  function parseFileScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeFileFields(d.fields);
    if (fields == null) return null;
    return { publisherPubKeyHex: d.pubKeyHex, fields };
  }
  var LEGACY_FILE_MARKERS = /* @__PURE__ */ new Set(["MPT-FILE", "P-FILE"]);
  function readLegacyPush(bytes, i) {
    const op3 = bytes[i++];
    let len;
    if (op3 >= 1 && op3 <= 75) len = op3;
    else if (op3 === 76) len = bytes[i++];
    else if (op3 === 77) {
      len = bytes[i] | bytes[i + 1] << 8;
      i += 2;
    } else if (op3 === 78) {
      len = bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536 + bytes[i + 3] * 16777216;
      i += 4;
    } else return null;
    if (i + len > bytes.length) return null;
    return { data: bytes.slice(i, i + len), next: i + len };
  }
  function parseLegacyFileScript(script) {
    const bytes = script.toBinary();
    let i = 0;
    if (bytes[i] === 0) i++;
    if (bytes[i] !== 106) return null;
    i++;
    const parts = [];
    while (i < bytes.length) {
      const r = readLegacyPush(bytes, i);
      if (r == null) break;
      parts.push(r.data);
      i = r.next;
    }
    if (parts.length < 4) return null;
    const marker = utf8Of(parts[0]);
    if (!LEGACY_FILE_MARKERS.has(marker)) return null;
    const fileBytes = [];
    for (const p of parts.slice(3)) for (const b of p) fileBytes.push(b);
    return { fields: { mimeType: utf8Of(parts[1]), fileName: utf8Of(parts[2]), fileBytes }, marker };
  }
  function encodeStorefrontFields(data) {
    const out = [
      P_PREFIX,
      [P_VERSION],
      [RECORD_STOREFRONT],
      utf8ToBytes2(data.description ?? ""),
      utf8ToBytes2(data.coverMimeType ?? ""),
      utf8ToBytes2(data.coverFileName ?? ""),
      data.coverBytes ?? []
    ];
    if (data.backCoverBytes != null && data.backCoverBytes.length > 0) {
      out.push(utf8ToBytes2(data.backCoverMimeType ?? ""), utf8ToBytes2(data.backCoverFileName ?? ""), data.backCoverBytes);
    }
    return out;
  }
  function decodeStorefrontFields(fields) {
    if (fields.length < 7) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_STOREFRONT) return null;
    const hasCover = !isEmptyOrZero(fields[6]);
    const hasBack = fields.length >= 10 && !isEmptyOrZero(fields[9]);
    return {
      description: isEmptyOrZero(fields[3]) ? "" : bytesToUtf8(fields[3]),
      coverMimeType: hasCover ? bytesToUtf8(fields[4]) : void 0,
      coverFileName: hasCover ? bytesToUtf8(fields[5]) : void 0,
      coverBytes: hasCover ? fields[6] : void 0,
      backCoverMimeType: hasBack ? bytesToUtf8(fields[7]) : void 0,
      backCoverFileName: hasBack ? bytesToUtf8(fields[8]) : void 0,
      backCoverBytes: hasBack ? fields[9] : void 0
    };
  }
  function buildStorefrontScript(publisherPubKeyHex, data) {
    return lock(publisherPubKeyHex, encodeStorefrontFields(data));
  }
  function parseStorefrontScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeStorefrontFields(d.fields);
    if (fields == null) return null;
    return { publisherPubKeyHex: d.pubKeyHex, fields };
  }
  function encodeMockupFields(manifest) {
    return [P_PREFIX, [P_VERSION], [RECORD_MOCKUP], manifest];
  }
  function buildMockupScript(publisherPubKeyHex, manifest) {
    return lock(publisherPubKeyHex, encodeMockupFields(manifest));
  }
  function encodeProfileFields(data) {
    return [
      P_PREFIX,
      [P_VERSION],
      [RECORD_PROFILE],
      utf8ToBytes2(data.alias ?? ""),
      utf8ToBytes2(data.avatarMimeType ?? ""),
      data.avatarBytes ?? []
    ];
  }
  function decodeProfileFields(fields) {
    if (fields.length < 6) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_PROFILE) return null;
    const hasAvatar = !isEmptyOrZero(fields[5]);
    return {
      alias: isEmptyOrZero(fields[3]) ? void 0 : bytesToUtf8(fields[3]),
      avatarMimeType: hasAvatar ? bytesToUtf8(fields[4]) : void 0,
      avatarBytes: hasAvatar ? fields[5] : void 0
    };
  }
  function buildProfileScript(ownerPubKeyHex, data) {
    return lock(ownerPubKeyHex, encodeProfileFields(data));
  }
  function parseProfileScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeProfileFields(d.fields);
    if (fields == null) return null;
    return { ownerPubKeyHex: d.pubKeyHex, fields };
  }
  var BONUS_LINK = 1;
  var BONUS_CODE = 2;
  var NOTE_HEADING = 3;
  var NOTE_TAGS = 4;
  function encodeNoteFields(data) {
    const fields = [
      P_PREFIX,
      [P_VERSION],
      [RECORD_NOTE],
      hexToBytes(data.collectionRef),
      utf8ToBytes2(data.text)
    ];
    if (data.bonusKind != null && data.bonusValue != null && data.bonusValue.length > 0) {
      fields.push([data.bonusKind === "link" ? BONUS_LINK : BONUS_CODE], utf8ToBytes2(data.bonusValue));
    }
    if (data.heading != null && data.heading.length > 0) fields.push([NOTE_HEADING], utf8ToBytes2(data.heading));
    if (data.tags != null && data.tags.length > 0) fields.push([NOTE_TAGS], utf8ToBytes2(data.tags.join(" ")));
    return fields;
  }
  function decodeNoteFields(fields) {
    if (fields.length < 5) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_NOTE) return null;
    if (fields[3].length !== 32) return null;
    const result = {
      collectionRef: bytesToHex(fields[3]),
      text: isEmptyOrZero(fields[4]) ? "" : bytesToUtf8(fields[4])
    };
    for (let i = 5; i + 1 < fields.length; i += 2) {
      const type = fields[i].length === 1 ? fields[i][0] : 0;
      const val2 = fields[i + 1];
      if (type === BONUS_LINK || type === BONUS_CODE) {
        result.bonusKind = type === BONUS_LINK ? "link" : "code";
        result.bonusValue = bytesToUtf8(val2);
      } else if (type === NOTE_HEADING) {
        result.heading = bytesToUtf8(val2);
      } else if (type === NOTE_TAGS) {
        const t = bytesToUtf8(val2).split(/[\s,]+/).filter(Boolean);
        if (t.length > 0) result.tags = t;
      }
    }
    return result;
  }
  function buildNoteScript(authorPubKeyHex, data) {
    return lock(authorPubKeyHex, encodeNoteFields(data));
  }
  function parseNoteScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeNoteFields(d.fields);
    if (fields == null) return null;
    return { authorPubKeyHex: d.pubKeyHex, fields };
  }
  function encodePreviewFields(data) {
    return [
      P_PREFIX,
      [P_VERSION],
      [RECORD_PREVIEW],
      hexToBytes(data.collectionRef),
      utf8ToBytes2(data.mimeType),
      data.previewBytes
    ];
  }
  function decodePreviewFields(fields) {
    if (fields.length < 6) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_PREVIEW) return null;
    if (fields[3].length !== 32) return null;
    return {
      collectionRef: bytesToHex(fields[3]),
      mimeType: bytesToUtf8(fields[4]),
      previewBytes: fields[5]
    };
  }
  function buildPreviewScript(publisherPubKeyHex, data) {
    return lock(publisherPubKeyHex, encodePreviewFields(data));
  }
  function parsePreviewScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodePreviewFields(d.fields);
    if (fields == null) return null;
    return { publisherPubKeyHex: d.pubKeyHex, fields };
  }
  function encodeConfigFields(data) {
    return [P_PREFIX, [P_VERSION], [RECORD_CONFIG], data.envelope];
  }
  function decodeConfigFields(fields) {
    if (fields.length < 4) return null;
    if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null;
    if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null;
    if (fields[2].length !== 1 || fields[2][0] !== RECORD_CONFIG) return null;
    return { envelope: fields[3] };
  }
  function buildConfigScript(ownerPubKeyHex, data) {
    return lock(ownerPubKeyHex, encodeConfigFields(data));
  }
  function parseConfigScript(script) {
    const d = decode(script);
    if (d == null) return null;
    const fields = decodeConfigFields(d.fields);
    if (fields == null) return null;
    return { ownerPubKeyHex: d.pubKeyHex, fields };
  }
  function encodeTokenRules(supply, divisibility, restrictions, version) {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint16(0, supply, true);
    view.setUint16(2, divisibility, true);
    view.setUint16(4, restrictions, true);
    view.setUint16(6, version, true);
    return bytesToHex(Array.from(new Uint8Array(buf)));
  }
  function decodeTokenRules(rulesHex) {
    const bytes = hexToBytes(rulesHex);
    const view = new DataView(new Uint8Array(bytes).buffer);
    const supply = view.getUint16(0, true);
    const restrictions = view.getUint16(4, true);
    return {
      supply,
      divisibility: view.getUint16(2, true),
      restrictions,
      version: view.getUint16(6, true),
      isFungible: (restrictions & RESTRICTION_FUNGIBLE) !== 0,
      isReplicable: (restrictions & RESTRICTION_REPLICABLE) !== 0,
      isUnlimited: supply === 0,
      isTracked: (restrictions & RESTRICTION_TRACK_TRANSFERS) !== 0,
      isEncrypted: (restrictions & RESTRICTION_ENCRYPTED) !== 0,
      isCompressed: (restrictions & RESTRICTION_COMPRESSED) !== 0
    };
  }

  // src/compress.ts
  var MIN_COMPRESS = 64;
  var PRECOMPRESSED_MIME = /* @__PURE__ */ new Set([
    "font/woff2",
    "font/woff",
    "application/font-woff2",
    "application/font-woff",
    "application/x-font-woff",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/heic",
    "image/heif",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/flac",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "application/zip",
    "application/gzip",
    "application/x-gzip",
    "application/x-zip-compressed",
    "application/pdf"
  ]);
  var PRECOMPRESSED_EXT = /* @__PURE__ */ new Set([
    "woff2",
    "woff",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "avif",
    "heic",
    "heif",
    "mp3",
    "m4a",
    "aac",
    "ogg",
    "oga",
    "flac",
    "mp4",
    "webm",
    "mov",
    "zip",
    "gz",
    "pdf"
  ]);
  function isPrecompressed(mimeType, fileName) {
    const mt = mimeType != null ? mimeType.split(";")[0].trim().toLowerCase() : "";
    if (mt !== "" && PRECOMPRESSED_MIME.has(mt)) return true;
    const ext = fileName != null ? /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? "" : "";
    return ext !== "" && PRECOMPRESSED_EXT.has(ext);
  }
  async function run(bytes, stream) {
    const writer = stream.writable.getWriter();
    void writer.write(new Uint8Array(bytes));
    void writer.close();
    const buf = await new Response(stream.readable).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }
  async function compressIfSmaller(bytes, mimeType, fileName) {
    if (isPrecompressed(mimeType, fileName) || bytes.length < MIN_COMPRESS || typeof CompressionStream === "undefined") {
      return { bytes, compressed: false };
    }
    const z = await run(bytes, new CompressionStream("gzip"));
    return z.length < bytes.length ? { bytes: z, compressed: true } : { bytes, compressed: false };
  }
  async function decompress(bytes) {
    return run(bytes, new DecompressionStream("gzip"));
  }

  // src/contentCrypto.ts
  var AES = "AES-GCM";
  var IV_BYTES = 32;
  var importKey = (K, use) => crypto.subtle.importKey("raw", Uint8Array.from(K), AES, false, [use]);
  async function gcmEncrypt(K, plain) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key2 = await importKey(K, "encrypt");
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: AES, iv }, key2, Uint8Array.from(plain)));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return Array.from(out);
  }
  async function gcmDecrypt(K, packed) {
    const b = Uint8Array.from(packed);
    if (b.length < IV_BYTES + 16) throw new Error("ciphertext too short to hold an IV and a tag");
    const key2 = await importKey(K, "decrypt");
    const pt = await crypto.subtle.decrypt({ name: AES, iv: b.subarray(0, IV_BYTES) }, key2, b.subarray(IV_BYTES));
    return Array.from(new Uint8Array(pt));
  }
  var OBFUSCATION_SALT = utf8Bytes("PHARLAP/tier1/content-key/v1");
  function newContentKey() {
    return randomBytes(32);
  }
  function newKeySalt() {
    return randomBytes(16);
  }
  async function encryptContent(fileBytes, K) {
    return await gcmEncrypt(K, fileBytes);
  }
  async function decryptContent(ciphertext, K) {
    return await gcmDecrypt(K, ciphertext);
  }
  function obfuscationKey(keySalt) {
    return sha256Bytes([...OBFUSCATION_SALT, ...keySalt]);
  }
  async function wrapContentKey(K, keySalt) {
    return await gcmEncrypt(obfuscationKey(keySalt), K);
  }
  async function unwrapContentKey(wrappedK, keySalt) {
    try {
      return await gcmDecrypt(obfuscationKey(keySalt), wrappedK);
    } catch {
      return null;
    }
  }

  // src/collectionBuilder.ts
  var UNLOCK_P2PKH = 108;
  function addFunding(tx, funding) {
    for (const f of funding) {
      tx.inputs.push({
        txid: txidToWire(f.utxo.txId),
        vout: f.utxo.outputIndex,
        script: new Uint8Array(0),
        sequence: 4294967295
      });
    }
  }
  function signFunding(tx, signer, funding, firstInput = 0) {
    const script = signer.lockingScript();
    funding.forEach((f, i) => {
      const at = firstInput + i;
      if (tx.inputs[at] === void 0) throw new Error(`signFunding: no input at ${at} (funding entry ${i})`);
      tx.inputs[at].script = signer.unlockP2PKH(tx, at, script, f.utxo.satoshis);
    });
  }
  var PHARLAP_OUTPUT_SATS = 1;
  var DEFAULT_FEE_PER_KB = 101;
  async function getSafeUtxos(provider2) {
    const utxos = await provider2.getUtxos();
    return utxos.filter((u) => u.satoshis > PHARLAP_OUTPUT_SATS);
  }
  function selectFunding(utxos, target) {
    const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);
    const picked = [];
    let total = 0;
    for (const u of sorted) {
      picked.push(u);
      total += u.satoshis;
      if (total >= target) return picked;
    }
    throw new Error(`Insufficient funds: have ${total} sats, need ~${target}`);
  }
  function sha256Hex(bytes) {
    return toHex(sha256(Uint8Array.from(bytes)));
  }
  async function buildTemplateTx(opts) {
    const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS;
    const publisherPub = toHex(opts.key.publicKey());
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, opts.funding);
    tx.outputs.push({ value: sats, script: buildTemplateScript(publisherPub, opts.template).toBinary() });
    const templateVout = 0;
    let fileVout = null;
    if (opts.file) {
      fileVout = tx.outputs.length;
      tx.outputs.push({ value: sats, script: buildFileScript(publisherPub, opts.file).toBinary() });
    }
    let storefrontVout = null;
    if (opts.storefront) {
      storefrontVout = tx.outputs.length;
      tx.outputs.push({ value: sats, script: buildStorefrontScript(publisherPub, opts.storefront).toBinary() });
    }
    let mockupVout = null;
    if (opts.mockup != null && opts.mockup.length > 0) {
      mockupVout = tx.outputs.length;
      tx.outputs.push({ value: sats, script: buildMockupScript(publisherPub, opts.mockup).toBinary() });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    applyFee(tx, {
      inputValues: opts.funding.map((f) => f.utxo.satoshis),
      unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, opts.key, opts.funding);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return {
      tx,
      tx1Id: tx.txid(),
      templateVout,
      fileVout,
      storefrontVout,
      mockupVout,
      changeVout: changeSats > 0 ? changeVout : null,
      changeSats
    };
  }
  async function buildGenesisTx(opts) {
    if (opts.mintCount < 1) throw new Error("mintCount must be >= 1");
    const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS;
    const ownerPub = toHex(opts.key.publicKey());
    const stateData = opts.stateData ?? "";
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, opts.funding);
    const tokenVouts = [];
    for (let i = 0; i < opts.mintCount; i++) {
      tokenVouts.push(tx.outputs.length);
      tx.outputs.push({
        value: sats,
        script: buildTokenScript(ownerPub, { tx1Ref: opts.tx1Id, stateData }).toBinary()
      });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    applyFee(tx, {
      inputValues: opts.funding.map((f) => f.utxo.satoshis),
      unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, opts.key, opts.funding);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return {
      tx,
      tx2Id: tx.txid(),
      tokenVouts,
      changeVout: changeSats > 0 ? changeVout : null,
      changeSats
    };
  }
  var SPEND_CANCELLED = "SPEND_CANCELLED";
  function spentSats(selected, finalChangeSats) {
    return selected.reduce((s, u) => s + u.satoshis, 0) - finalChangeSats;
  }
  async function createCollection(provider2, key2, params) {
    const sats = params.outputSats ?? PHARLAP_OUTPUT_SATS;
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const supply = params.supply ?? 1;
    const mintCount = params.mintCount ?? (supply > 0 ? supply : 1);
    const encrypt2 = params.encrypt === true && params.file != null;
    let storedBytes = params.file?.bytes;
    let compressed = false;
    let wrappedKey;
    let keySalt;
    if (params.file != null) {
      const z = await compressIfSmaller(params.file.bytes, params.file.mimeType, params.file.fileName);
      storedBytes = z.bytes;
      compressed = z.compressed;
      if (encrypt2) {
        const K = newContentKey();
        keySalt = newKeySalt();
        storedBytes = encryptContent(storedBytes, K);
        wrappedKey = wrapContentKey(K, keySalt);
      }
    }
    const restrictions = (params.restrictions ?? 0) | (encrypt2 ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0);
    const template = {
      tokenName: params.tokenName,
      tokenRules: encodeTokenRules(supply, params.divisibility ?? 0, restrictions, params.rulesVersion ?? 1),
      covenantScript: params.covenantScript ?? "",
      // PUBLIC content binds the plaintext hash (provenance); ENCRYPTED content binds the ciphertext hash (privacy —
      // a public plaintext hash would be a confirmation oracle). Mirrors the edition path.
      fileHash: params.file == null ? void 0 : encrypt2 ? sha256Hex(storedBytes) : sha256Hex(params.file.bytes),
      wrappedKey,
      keySalt,
      license: params.license,
      licenseRef: params.licenseRef
    };
    const file = params.file ? { mimeType: params.file.mimeType, fileName: params.file.fileName, fileBytes: storedBytes } : void 0;
    const hasStorefront = params.description != null && params.description.length > 0 || params.cover != null;
    const storefront = hasStorefront ? {
      description: params.description ?? "",
      coverMimeType: params.cover?.mimeType,
      coverFileName: params.cover?.fileName,
      coverBytes: params.cover?.bytes,
      // A back cover only makes sense alongside a front cover (the codec keys "has back" off the bytes).
      backCoverMimeType: params.cover != null ? params.backCover?.mimeType : void 0,
      backCoverFileName: params.cover != null ? params.backCover?.fileName : void 0,
      backCoverBytes: params.cover != null ? params.backCover?.bytes : void 0
    } : void 0;
    const numOutputs = 1 + (file ? 1 : 0) + (storefront ? 1 : 0) + (params.mockupManifest?.length ? 1 : 0) + mintCount;
    const tx1Bytes = 400 + (file ? file.fileBytes.length : 0) + (params.cover ? params.cover.bytes.length : 0) + (params.backCover ? params.backCover.bytes.length : 0);
    const tx2Bytes = 300 + mintCount * 80;
    const estFee = Math.ceil((tx1Bytes + tx2Bytes) * feePerKb / 1e3);
    const target = numOutputs * sats + estFee + Math.max(1e3, Math.ceil(estFee * 0.1));
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    const funding = selected.map((u) => ({ utxo: u }));
    const t1 = await buildTemplateTx({ key: key2, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: sats, feePerKb });
    if (t1.changeVout == null) {
      throw new Error("Insufficient funding: the template tx left no change to fund the genesis mint. Add more funds.");
    }
    const t2Funding = [
      {
        utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: "" }
      }
    ];
    const t2 = await buildGenesisTx({
      key: key2,
      funding: t2Funding,
      tx1Id: t1.tx1Id,
      mintCount,
      stateData: params.initialStateData ?? "",
      outputSats: sats,
      feePerKb
    });
    if (params.confirmSpend != null && !await params.confirmSpend(spentSats(selected, t2.changeSats))) {
      throw new Error(SPEND_CANCELLED);
    }
    await provider2.broadcast(t1.tx.hex(), { awaitSeen: true });
    provider2.registerPendingTx(
      t1.tx1Id,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      { outputIndex: t1.changeVout, satoshis: t1.changeSats }
    );
    await provider2.broadcast(t2.tx.hex());
    provider2.registerPendingTx(
      t2.tx2Id,
      [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
      t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : void 0
    );
    return {
      collectionId: t1.tx1Id,
      tx1Id: t1.tx1Id,
      tx2Id: t2.tx2Id,
      tokenOutpoints: t2.tokenVouts.map((v) => ({ txId: t2.tx2Id, outputIndex: v }))
    };
  }

  // src/bmc.ts
  function readStoreZip(bytes) {
    const u16 = (o) => bytes[o] | bytes[o + 1] << 8;
    const u323 = (o) => bytes[o] + bytes[o + 1] * 256 + bytes[o + 2] * 65536 + bytes[o + 3] * 16777216;
    const out = {};
    let i = 0;
    while (i + 30 <= bytes.length && u323(i) === 67324752) {
      const method = u16(i + 8);
      const size = u323(i + 18);
      const nameLen = u16(i + 26);
      const extraLen = u16(i + 28);
      if (method !== 0) return null;
      const nameStart = i + 30;
      let name = "";
      for (let j = 0; j < nameLen; j++) name += String.fromCharCode(bytes[nameStart + j]);
      const dataStart = nameStart + nameLen + extraLen;
      out[name] = bytes.slice(dataStart, dataStart + size);
      i = dataStart + size;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  var isBmc = (b) => b.length > 4 && b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4;
  function parseBmcSet(bytes) {
    if (!isBmc(bytes)) return null;
    const files = readStoreZip(bytes);
    if (files == null || files["bmc.json"] == null) return null;
    try {
      const manifest = JSON.parse(utf8Of(files["bmc.json"]));
      const members = (manifest.members ?? []).map((m) => ({ name: m.name, file: m.file, mimeType: m.mime ?? "application/octet-stream", bytes: files[m.file] })).filter((m) => Boolean(m.name) && m.bytes != null && m.bytes.length > 0);
      return members.length > 0 ? { name: manifest.name ?? "set", members } : null;
    } catch {
      return null;
    }
  }
  function bmcMember(set, name) {
    return set.members.find((m) => m.name === name) ?? set.members.find((m) => m.file === name) ?? null;
  }

  // src/mockup.ts
  var TAG = 77;
  var FLAG_PLACE = 1;
  var FLAG_WARP = 2;
  var FLAG_PROP_IDX = 4;
  var FLAG_DESIGN_IDX = 8;
  var FLAG_DESIGN_EMBEDDED = 16;
  var RATIOS = [
    { id: 0, name: "1:1", w: 1, h: 1 },
    // square — tote, sticker, mug (centred), matted poster, phone (centred)
    { id: 1, name: "4:5", w: 4, h: 5 },
    // portrait — apparel fronts, posters
    { id: 2, name: "2:3", w: 2, h: 3 },
    // tall portrait — art prints, posters
    { id: 3, name: "16:9", w: 16, h: 9 },
    // wide landscape — banners, laptop skins, mug wraps
    { id: 4, name: "9:16", w: 9, h: 16 }
    // tall — phone cases, story format
  ];
  function ratioOf(width, height) {
    if (!(width > 0) || !(height > 0)) return 0;
    const target = Math.log(width / height);
    let best = 0, bestD = Infinity;
    for (const r of RATIOS) {
      const d = Math.abs(Math.log(r.w / r.h) - target);
      if (d < bestD) {
        bestD = d;
        best = r.id;
      }
    }
    return best;
  }
  var SIGNED = { u8: false, i8: true, unit: false, sunit: true, deg: false, q4: false };
  var WARP_TYPES = [
    "flat",
    "cyl",
    "disp",
    "persp",
    "bulge",
    "sphere",
    "cone",
    "mesh",
    "ripple",
    "wave",
    "curl",
    "emboss",
    "fold",
    "skew",
    "_r14",
    "ext"
  ];
  var WARP_ID = Object.fromEntries(WARP_TYPES.map((t, i) => [t, i]));
  var WARP_SCHEMA = {
    flat: [],
    cyl: [["curve", "unit"], ["bow", "sunit"], ["axis", "u8"]],
    disp: [["str", "q4"], ["map", "u8"]],
    persp: [["kx", "sunit"], ["ky", "sunit"]],
    bulge: [["amt", "sunit"]],
    sphere: [["curve", "unit"]],
    cone: [["taper", "unit"], ["curve", "unit"]],
    ripple: [["amp", "u8"], ["freq", "u8"], ["phase", "u8"], ["axis", "u8"]],
    wave: [["amp", "u8"], ["len", "u8"], ["angle", "deg"]],
    curl: [["amt", "u8"], ["corner", "u8"]],
    emboss: [["depth", "sunit"]],
    skew: [["sx", "sunit"], ["sy", "sunit"]]
    // mesh, fold, ext: variable-length → carried as `raw` bytes on the stage.
  };
  var TAG_PROP = 80;
  var PROP_FIELD = {
    RATIO: 1,
    FABRIC: 2,
    PLACE: 3,
    WARP: 4,
    QUAD: 5,
    DISP: 6,
    MASK: 7,
    SHADE: 8,
    DIMS: 9,
    NAME: 10,
    CONTOUR: 11
  };
  var W = class {
    constructor() {
      this.b = [];
    }
    u8(v) {
      this.b.push(v & 255);
      return this;
    }
    i8(v) {
      this.b.push((v | 0) & 255);
      return this;
    }
    u16(v) {
      this.b.push(v & 255, v >>> 8 & 255);
      return this;
    }
    bytes(a) {
      for (const x of a) this.b.push(x & 255);
      return this;
    }
    out() {
      return this.b;
    }
  };
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  function hexToBytes2(hex) {
    const o = [];
    for (let i = 0; i < hex.length; i += 2) o.push(parseInt(hex.slice(i, i + 2), 16));
    return o;
  }
  function utf8ToBytes3(s) {
    return Array.from(new TextEncoder().encode(s));
  }
  function encParam(enc, v) {
    switch (enc) {
      case "u8":
        return clamp(Math.round(v), 0, 255);
      case "i8":
        return clamp(Math.round(v), -128, 127);
      case "unit":
        return clamp(Math.round(v * 255), 0, 255);
      case "sunit":
        return clamp(Math.round(v * 127), -127, 127);
      case "deg":
        return clamp(Math.round((v % 360 + 360) % 360 / 360 * 255), 0, 255);
      case "q4":
        return clamp(Math.round(v * 4), 0, 255);
    }
  }
  function packWarp(stages) {
    const w = new W().u8(stages.length);
    for (const st of stages) {
      const id = WARP_ID[st.t] ?? WARP_ID.ext;
      const schema = WARP_SCHEMA[st.t];
      const pw = new W();
      if (schema != null) {
        for (const [name, enc] of schema) {
          const q = encParam(enc, Number(st[name] ?? 0));
          SIGNED[enc] ? pw.i8(q) : pw.u8(q);
        }
      } else if (Array.isArray(st.raw)) {
        pw.bytes(st.raw);
      }
      const pb = pw.out();
      w.u8(id).u8(pb.length).bytes(pb);
    }
    return w.out();
  }
  function packCover(c) {
    const d = c.design;
    const propIdx = c.prop.index != null;
    const designIdx = d != null && d.index != null;
    let flags = 0;
    if (c.place) flags |= FLAG_PLACE;
    if (c.warp) flags |= FLAG_WARP;
    if (propIdx) flags |= FLAG_PROP_IDX;
    if (designIdx) flags |= FLAG_DESIGN_IDX;
    if (d == null) flags |= FLAG_DESIGN_EMBEDDED;
    const w = new W().u8(TAG).u8(c.version & 255).u8(flags);
    propIdx ? w.u16(c.prop.index) : w.bytes(hexToBytes2(c.prop.tx));
    if (d != null) {
      d.index != null ? w.u16(d.index) : w.bytes(hexToBytes2(d.tx));
    }
    if (c.place) {
      w.u16(clamp(Math.round(c.place.x * 65535), 0, 65535)).u16(clamp(Math.round(c.place.y * 65535), 0, 65535)).u16(clamp(Math.round(c.place.scale * 1024), 0, 65535)).u8(clamp(Math.round((c.place.rot % 360 + 360) % 360 / 360 * 255), 0, 255)).i8(clamp(Math.round(c.place.skewX * 127), -127, 127)).i8(clamp(Math.round(c.place.skewY * 127), -127, 127)).u8(clamp(Math.round(c.place.fabric * 255), 0, 255));
    }
    if (c.warp) w.bytes(packWarp(c.warp));
    return w.out();
  }
  function putBlock(w, id, val2) {
    w.u8(id);
    if (val2.length < 255) w.u8(val2.length);
    else w.u8(255).u16(val2.length);
    w.bytes(val2);
  }
  function packProp(p) {
    const w = new W().u8(TAG_PROP).u8(p.version & 255);
    putBlock(w, PROP_FIELD.RATIO, [p.ratio & 255]);
    putBlock(w, PROP_FIELD.FABRIC, [clamp(Math.round(p.fabric * 255), 0, 255)]);
    if (p.place) {
      putBlock(w, PROP_FIELD.PLACE, new W().u16(clamp(Math.round(p.place.x * 65535), 0, 65535)).u16(clamp(Math.round(p.place.y * 65535), 0, 65535)).u16(clamp(Math.round(p.place.scale * 1024), 0, 65535)).u8(clamp(Math.round((p.place.rot % 360 + 360) % 360 / 360 * 255), 0, 255)).i8(clamp(Math.round(p.place.skewX * 127), -127, 127)).i8(clamp(Math.round(p.place.skewY * 127), -127, 127)).out());
    }
    if (p.quad && p.quad.length === 4) {
      const qw = new W();
      for (const [x, y] of p.quad) qw.u16(clamp(Math.round(x * 65535), 0, 65535)).u16(clamp(Math.round(y * 65535), 0, 65535));
      putBlock(w, PROP_FIELD.QUAD, qw.out());
    }
    if (p.warp && p.warp.length) putBlock(w, PROP_FIELD.WARP, packWarp(p.warp));
    if (p.disp) putBlock(w, PROP_FIELD.DISP, [...hexToBytes2(p.disp.tx), clamp(Math.round(p.disp.str * 255), 0, 255)]);
    if (p.mask) putBlock(w, PROP_FIELD.MASK, hexToBytes2(p.mask));
    if (p.shade) putBlock(w, PROP_FIELD.SHADE, hexToBytes2(p.shade));
    if (p.dims) putBlock(w, PROP_FIELD.DIMS, new W().u16(p.dims.wmm).u16(p.dims.hmm).out());
    if (p.name) putBlock(w, PROP_FIELD.NAME, utf8ToBytes3(p.name));
    if (p.contour) putBlock(w, PROP_FIELD.CONTOUR, [clamp(Math.round(p.contour), 0, 255)]);
    for (const e of p.ext ?? []) putBlock(w, e.id, e.data);
    return w.out();
  }

  // src/pushtx.ts
  var bytesBE = (v) => {
    if (v === 0n) return [];
    let h = v.toString(16);
    if (h.length & 1) h = "0" + h;
    return Array.from(fromHex(h));
  };
  var SIGHASH_ALL_FORKID = 65;
  var A_HEX = "11".repeat(32);
  var K_HEX = "22".repeat(32);
  function toScriptNumLE(bn) {
    if (bn === 0n) return [];
    const le = bytesBE(bn).reverse();
    if ((le[le.length - 1] & 128) !== 0) le.push(0);
    return le;
  }
  function minimalBE(bn) {
    const be = bytesBE(bn);
    if ((be[0] & 128) !== 0) be.unshift(0);
    return be;
  }
  function pushTxConstants(scope = SIGHASH_ALL_FORKID) {
    const n = N;
    const a = BigInt("0x" + A_HEX);
    const k = BigInt("0x" + K_HEX);
    const r = mod(mul(k).x, n);
    const rBE = minimalBE(r);
    return {
      Qbytes: Array.from(serP(mul(a))),
      rDerInt: [2, rBE.length, ...rBE],
      raLE: toScriptNumLE(mod(r * a, n)),
      nLE: toScriptNumLE(n),
      kInvLE: toScriptNumLE(invN(k)),
      scope
    };
  }
  var op = (code) => ({ op: code });
  function push(data) {
    if (data.length < 76) return { op: data.length, data };
    if (data.length < 256) return { op: OP.OP_PUSHDATA1, data };
    if (data.length < 65536) return { op: OP.OP_PUSHDATA2, data };
    return { op: OP.OP_PUSHDATA4, data };
  }
  function reverseBytesOps(len) {
    const ops = [];
    for (let i = 0; i < len - 1; i++) ops.push(op(OP.OP_1), op(OP.OP_SPLIT));
    for (let i = 0; i < len - 1; i++) ops.push(op(OP.OP_SWAP), op(OP.OP_CAT));
    return ops;
  }
  function deriveSigOps(c) {
    return [
      // e = HASH256(preimage) as a positive script number (reverse BE→LE, append sign byte, minimise)
      op(OP.OP_HASH256),
      ...reverseBytesOps(32),
      push([0]),
      op(OP.OP_CAT),
      op(OP.OP_BIN2NUM),
      // s = k⁻¹·((e + r·a) mod n) mod n
      push(c.raLE),
      op(OP.OP_ADD),
      push(c.nLE),
      op(OP.OP_MOD),
      push(c.kInvLE),
      op(OP.OP_MUL),
      push(c.nLE),
      op(OP.OP_MOD),
      // s (LE number) → minimal-DER integer: NUM2BIN(33) → reverse → strip leading zeros at 33−size
      op(OP.OP_SIZE),
      push([33]),
      op(OP.OP_SWAP),
      op(OP.OP_SUB),
      op(OP.OP_TOALTSTACK),
      push([33]),
      op(OP.OP_NUM2BIN),
      ...reverseBytesOps(33),
      op(OP.OP_FROMALTSTACK),
      op(OP.OP_SPLIT),
      op(OP.OP_NIP),
      op(OP.OP_SIZE),
      op(OP.OP_SWAP),
      op(OP.OP_CAT),
      // <len> ++ sBE
      push([2]),
      op(OP.OP_SWAP),
      op(OP.OP_CAT),
      // 0x02 ++ <len> ++ sBE
      // assemble full sig: 0x30 <bodylen> rDerInt sDerInt <scope>
      push(c.rDerInt),
      op(OP.OP_SWAP),
      op(OP.OP_CAT),
      op(OP.OP_SIZE),
      op(OP.OP_SWAP),
      op(OP.OP_CAT),
      push([48]),
      op(OP.OP_SWAP),
      op(OP.OP_CAT),
      push([c.scope]),
      op(OP.OP_CAT)
    ];
  }
  function pushTxVerifyOps(c = pushTxConstants()) {
    return [
      op(OP.OP_DUP),
      ...deriveSigOps(c),
      push(c.Qbytes),
      op(OP.OP_CHECKSIG),
      op(OP.OP_VERIFY)
    ];
  }
  var pushData = push;

  // src/covenant.ts
  var LockingScript2 = class {
    static from(chunks) {
      return new LockingScript(chunks.map((c) => ({ op: c.op, data: c.data === void 0 ? void 0 : Uint8Array.from(c.data) })));
    }
  };
  var op2 = (code) => ({ op: code });
  function u64le(n) {
    const out = [];
    let v = n;
    for (let i = 0; i < 8; i++) {
      out.push(v & 255);
      v = Math.floor(v / 256);
    }
    return out;
  }
  function numLE(n) {
    if (n === 0) return [];
    const out = [];
    let v = n;
    while (v > 0) {
      out.push(v & 255);
      v = Math.floor(v / 256);
    }
    if ((out[out.length - 1] & 128) !== 0) out.push(0);
    return out;
  }
  function varInt(n) {
    if (n < 253) return [n];
    if (n <= 65535) return [253, n & 255, n >> 8 & 255];
    if (n <= 4294967295) return [254, n & 255, n >> 8 & 255, n >> 16 & 255, n >> 24 & 255];
    throw new Error("varInt: value too large");
  }
  function serializeOutput(satoshis, scriptBytes) {
    return [...u64le(satoshis), ...varInt(scriptBytes.length), ...scriptBytes];
  }
  function p2pkhScript2(hash20) {
    return [118, 169, 20, ...hash20, 136, 172];
  }
  function extractHashOutputsOps() {
    return [
      op2(OP.OP_SIZE),
      pushData([40]),
      op2(OP.OP_SUB),
      op2(OP.OP_SPLIT),
      op2(OP.OP_NIP),
      // tail 40 bytes
      pushData([32]),
      op2(OP.OP_SPLIT),
      op2(OP.OP_DROP)
      // first 32 = hashOutputs
    ];
  }
  function extractScriptCodeFieldOps() {
    return [
      pushData([104]),
      op2(OP.OP_SPLIT),
      op2(OP.OP_NIP),
      // drop 104-byte prefix
      op2(OP.OP_SIZE),
      pushData([52]),
      op2(OP.OP_SUB),
      op2(OP.OP_SPLIT),
      op2(OP.OP_DROP)
      // drop 52-byte suffix
    ];
  }
  function covenantPrefixOps(fieldPubkeyOffset, c = pushTxConstants()) {
    return [
      ...pushTxVerifyOps(c),
      op2(OP.OP_DUP),
      ...extractHashOutputsOps(),
      op2(OP.OP_TOALTSTACK),
      // alt:[hashOutputs]
      ...extractScriptCodeFieldOps(),
      // [ ..., scFld ]
      pushData(numLE(fieldPubkeyOffset)),
      op2(OP.OP_SPLIT),
      // [ ..., pre, ownerPub‖suffix ]
      pushData([33]),
      op2(OP.OP_SPLIT)
      // [ ..., pre, ownerPub, suffix ]
    ];
  }
  function replicateTailOps(p) {
    const VALUE1 = u64le(p.tokenSats ?? 1);
    const OUT2 = serializeOutput(p.publisherFeeSats, p2pkhScript2(p.publisherPubKeyHash));
    const C3pre = [...u64le(p.holderFeeSats), 25, 118, 169, 20];
    const C3suf = [136, 172];
    return [
      // out0 = VALUE1 ‖ pre ‖ ownerPub ‖ suffix (token back to holder, verbatim)
      pushData(VALUE1),
      pushData([3]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      pushData([2]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      pushData([1]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      // out1 = VALUE1 ‖ pre ‖ buyerPub ‖ suffix (replica to buyer)
      pushData(VALUE1),
      pushData([4]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      pushData([5]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      pushData([2]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      op2(OP.OP_CAT),
      // out0 ‖ out1
      pushData(OUT2),
      op2(OP.OP_CAT),
      // ‖ out2 (publisher fee, constant)
      pushData(C3pre),
      op2(OP.OP_CAT),
      pushData([2]),
      op2(OP.OP_PICK),
      op2(OP.OP_HASH160),
      op2(OP.OP_CAT),
      // ‖ HASH160(ownerPub)
      pushData(C3suf),
      op2(OP.OP_CAT),
      // → out3 (holder fee)
      pushData([5]),
      op2(OP.OP_ROLL),
      op2(OP.OP_CAT),
      // ‖ buyerChange → expected
      op2(OP.OP_TOALTSTACK),
      op2(OP.OP_2DROP),
      op2(OP.OP_2DROP),
      // stash expected; drop 4 leftover pieces
      op2(OP.OP_FROMALTSTACK),
      op2(OP.OP_HASH256),
      op2(OP.OP_FROMALTSTACK),
      op2(OP.OP_EQUAL)
    ];
  }
  function transferTailOps(p) {
    const VALUE1 = u64le(p.tokenSats ?? 1);
    return [
      // authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY
      pushData([1]),
      op2(OP.OP_PICK),
      // copy ownerPub
      pushData([4]),
      op2(OP.OP_PICK),
      // copy ownerSig
      op2(OP.OP_SWAP),
      op2(OP.OP_CHECKSIGVERIFY),
      // out0 = VALUE1 ‖ pre ‖ newOwnerPub ‖ suffix
      pushData(VALUE1),
      pushData([3]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      // ‖ pre
      pushData([5]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      // ‖ newOwnerPub
      pushData([1]),
      op2(OP.OP_PICK),
      op2(OP.OP_CAT),
      // ‖ suffix → out0
      pushData([6]),
      op2(OP.OP_ROLL),
      op2(OP.OP_CAT),
      // ‖ change → expected
      op2(OP.OP_TOALTSTACK),
      op2(OP.OP_2DROP),
      op2(OP.OP_2DROP),
      op2(OP.OP_DROP),
      // drop 5 leftover pieces
      op2(OP.OP_FROMALTSTACK),
      op2(OP.OP_HASH256),
      op2(OP.OP_FROMALTSTACK),
      op2(OP.OP_EQUAL)
    ];
  }
  function burnTailOps() {
    return [
      // authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY  (same auth as transferTailOps)
      pushData([1]),
      op2(OP.OP_PICK),
      // copy ownerPub
      pushData([4]),
      op2(OP.OP_PICK),
      // copy ownerSig
      op2(OP.OP_SWAP),
      op2(OP.OP_CHECKSIGVERIFY),
      // burn: enforce nothing — the owner authorised their outputs by signing. Clean up + succeed.
      op2(OP.OP_2DROP),
      op2(OP.OP_2DROP),
      // drop suffix, ownerPub, pre, ownerSig
      op2(OP.OP_FROMALTSTACK),
      op2(OP.OP_DROP),
      // discard hashOutputs (unused by burn)
      op2(OP.OP_1)
    ];
  }
  var EDITION_SCOPE = 193;
  var RECORD_EDITION = 5;
  function serializedPushLen(data) {
    if (data.length < 76) return 1 + data.length;
    if (data.length < 256) return 2 + data.length;
    if (data.length < 65536) return 3 + data.length;
    return 5 + data.length;
  }
  function editionFieldChunks(f) {
    return [
      pushData(f.prefix ?? [80]),
      pushData(f.version ?? [3]),
      pushData([RECORD_EDITION]),
      pushData(f.tx1Ref),
      pushData(f.ownerPubKey)
    ];
  }
  function editionLockOps(p) {
    const c = p.c ?? pushTxConstants(EDITION_SCOPE);
    return [
      ...editionFieldChunks(p),
      op2(OP.OP_2DROP),
      op2(OP.OP_2DROP),
      op2(OP.OP_DROP),
      // 5 fields
      ...covenantPrefixOps(p.fieldPubkeyOffset, c),
      pushData([3]),
      op2(OP.OP_ROLL),
      // bring the branch selector to the top
      op2(OP.OP_DUP),
      op2(OP.OP_2),
      op2(OP.OP_NUMEQUAL),
      op2(OP.OP_IF),
      // selector == 2 → burn
      op2(OP.OP_DROP),
      // drop the selector
      ...burnTailOps(),
      op2(OP.OP_ELSE),
      // selector 1 → transfer, 0 → replicate
      op2(OP.OP_IF),
      ...transferTailOps({ tokenSats: p.tokenSats }),
      op2(OP.OP_ELSE),
      ...replicateTailOps(p),
      op2(OP.OP_ENDIF),
      op2(OP.OP_ENDIF)
    ];
  }
  function buildEditionLock(p) {
    const before = [p.prefix ?? [80], p.version ?? [3], [RECORD_EDITION], p.tx1Ref];
    const O = before.reduce((s, f) => s + serializedPushLen(f), 0) + 1;
    const probeLen = LockingScript2.from(editionLockOps({ ...p, fieldPubkeyOffset: 1 })).toBinary().length;
    const varIntSize = probeLen < 253 ? 1 : probeLen < 65536 ? 3 : 5;
    return LockingScript2.from(editionLockOps({ ...p, fieldPubkeyOffset: varIntSize + O }));
  }
  function editionSupportsBurn(lockBytes) {
    const chunks = LockingScript2.fromBinary(lockBytes).chunks;
    return chunks != null && chunks.some((c) => c.op === OP.OP_NUMEQUAL);
  }
  var EDITION_OWNER_SCRIPT_OFFSET = 40;
  function swapEditionOwner(lockBytes, newOwnerPub) {
    if (newOwnerPub.length !== 33) throw new Error("swapEditionOwner: owner pubkey must be 33 bytes");
    const out = [...lockBytes];
    for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = newOwnerPub[i];
    return out;
  }
  var EDITION_TX1REF_SCRIPT_OFFSET = 7;
  function buildHolderEditionScript(templateCovenantBytes, tx1Ref, ownerPub) {
    if (tx1Ref.length !== 32) throw new Error("buildHolderEditionScript: tx1Ref must be 32 bytes");
    if (ownerPub.length !== 33) throw new Error("buildHolderEditionScript: owner pubkey must be 33 bytes");
    const out = [...templateCovenantBytes];
    for (let i = 0; i < 32; i++) out[EDITION_TX1REF_SCRIPT_OFFSET + i] = tx1Ref[i];
    for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = ownerPub[i];
    return out;
  }
  function editionOwnerPubKey(lockBytes) {
    return lockBytes.slice(EDITION_OWNER_SCRIPT_OFFSET, EDITION_OWNER_SCRIPT_OFFSET + 33);
  }
  function chunkBytes(c) {
    if (c.data != null && c.data.length > 0) return c.data;
    if (c.op === OP.OP_0) return [];
    if (c.op >= 81 && c.op <= 96) return [c.op - 80];
    if (c.op === OP.OP_1NEGATE) return [129];
    return null;
  }
  function leToNum(b) {
    let n = 0;
    for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i];
    return n;
  }
  function parseEditionScript(script) {
    const ch = script.chunks;
    if (ch == null || ch.length < 8) return null;
    const P2 = chunkBytes(ch[0]);
    const ver = chunkBytes(ch[1]);
    const rec = chunkBytes(ch[2]);
    const tx1Ref = chunkBytes(ch[3]);
    const ownerPub = chunkBytes(ch[4]);
    if (P2 == null || P2.length !== 1 || P2[0] !== 80) return null;
    if (ver == null || ver[0] !== 3) return null;
    if (rec == null || rec[0] !== RECORD_EDITION) return null;
    if (tx1Ref == null || tx1Ref.length !== 32) return null;
    if (ownerPub == null || ownerPub.length !== 33) return null;
    if (ch[5].op !== OP.OP_2DROP || ch[6].op !== OP.OP_2DROP || ch[7].op !== OP.OP_DROP) return null;
    let publisherFeeSats = 0, holderFeeSats = 0;
    let publisherPubKeyHash = null;
    const isP2pkhValue = (d) => d[8] === 25 && d[9] === 118 && d[10] === 169 && d[11] === 20;
    for (const c of ch) {
      const d = chunkBytes(c);
      if (d == null) continue;
      if (d.length === 34 && isP2pkhValue(d)) {
        publisherFeeSats = leToNum(d.slice(0, 8));
        publisherPubKeyHash = d.slice(12, 32);
      } else if (d.length === 12 && isP2pkhValue(d)) {
        holderFeeSats = leToNum(d.slice(0, 8));
      }
    }
    if (publisherPubKeyHash == null) return null;
    return {
      tx1RefHex: hexOf(tx1Ref),
      ownerPubKeyHex: hexOf(ownerPub),
      stateDataHex: "",
      terms: { publisherPubKeyHash, publisherFeeSats, holderFeeSats }
    };
  }
  function editionReplicateUnlockChunks(p) {
    return [pushData(p.buyerChange), pushData(p.buyerPubKey), op2(OP.OP_0), pushData(p.preimage)];
  }
  function editionTransferUnlockChunks(p) {
    return [pushData(p.change), pushData(p.newOwnerPubKey), pushData(p.ownerSig), op2(OP.OP_1), pushData(p.preimage)];
  }
  function editionBurnUnlockChunks(p) {
    return [pushData(p.ownerSig), op2(OP.OP_2), pushData(p.preimage)];
  }

  // src/sellerNote.ts
  var MAX_NOTE_BYTES = 3072;
  var MAX_HISTORY_SCAN = 30;
  function utf8Len(s) {
    return new TextEncoder().encode(s).length;
  }
  var MAX_HEADING_BYTES = 120;
  var MAX_TAGS_BYTES = 160;
  function noteHasContent(n) {
    return (n.text?.trim().length ?? 0) > 0 || (n.bonusValue?.trim().length ?? 0) > 0 || (n.heading?.trim().length ?? 0) > 0 || n.tags != null && n.tags.length > 0;
  }
  async function publishSellerNote(provider2, key2, collectionId, note) {
    const trimmed = note.text.trim();
    const heading = note.heading?.trim();
    const tags = note.tags?.map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);
    const bonusValue = note.bonusValue?.trim();
    if (trimmed.length === 0 && !bonusValue && !heading && !(tags && tags.length > 0)) throw new Error("note is empty");
    if (utf8Len(trimmed) > MAX_NOTE_BYTES) throw new Error(`note exceeds ${MAX_NOTE_BYTES} bytes`);
    if (heading != null && utf8Len(heading) > MAX_HEADING_BYTES) throw new Error(`heading exceeds ${MAX_HEADING_BYTES} bytes`);
    if (tags != null && utf8Len(tags.join(" ")) > MAX_TAGS_BYTES) throw new Error(`tags exceed ${MAX_TAGS_BYTES} bytes`);
    if (bonusValue && utf8Len(bonusValue) > MAX_NOTE_BYTES) throw new Error(`bonus exceeds ${MAX_NOTE_BYTES} bytes`);
    const authorPub = toHex(key2.publicKey());
    const selected = selectFunding(await getSafeUtxos(provider2), PHARLAP_OUTPUT_SATS + 500);
    const funding = selected.map((u) => ({ utxo: u }));
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: buildNoteScript(authorPub, {
        collectionRef: collectionId,
        text: trimmed,
        ...heading ? { heading } : {},
        ...tags && tags.length > 0 ? { tags } : {},
        ...bonusValue ? { bonusKind: note.bonusKind, bonusValue } : {}
      }).toBinary()
    });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout: 1,
      satPerKb: DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[1]?.value ?? 0) > 0 ? { outputIndex: 1, satoshis: tx.outputs[1].value ?? 0 } : void 0
    );
    return txId;
  }
  function readNoteFromTx(tx, collectionId) {
    const want = collectionId.toLowerCase();
    for (const o of tx.outputs) {
      const n = parseNoteScript(LockingScript.fromBinary(o.script));
      if (n && n.fields.collectionRef.toLowerCase() === want) {
        return { text: n.fields.text, heading: n.fields.heading, tags: n.fields.tags, bonusKind: n.fields.bonusKind, bonusValue: n.fields.bonusValue };
      }
    }
    return null;
  }
  async function resolveSellerNote(provider2, sellerPubKeyHex, collectionId) {
    const sellerAddress = addressFromPubHex(sellerPubKeyHex);
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory(sellerAddress)) heightByTx.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const txId of await provider2.getRecentTxIdsForAddress(sellerAddress)) {
        if (!heightByTx.has(txId)) heightByTx.set(txId, 0);
      }
    } catch {
    }
    if (heightByTx.size === 0) return null;
    const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_HISTORY_SCAN).map(([txId]) => txId);
    const seller = sellerPubKeyHex.toLowerCase();
    const want = collectionId.toLowerCase();
    for (const txId of ordered) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const n = parseNoteScript(LockingScript.fromBinary(o.script));
        if (n && n.authorPubKeyHex.toLowerCase() === seller && n.fields.collectionRef.toLowerCase() === want) {
          return { text: n.fields.text, heading: n.fields.heading, tags: n.fields.tags, bonusKind: n.fields.bonusKind, bonusValue: n.fields.bonusValue, txId };
        }
      }
    }
    return null;
  }

  // src/editionBuilder.ts
  var UnlockingScript2 = {
    from: (chunks) => new UnlockingScript(chunks.map((c) => ({ op: c.op, data: c.data === void 0 ? void 0 : Uint8Array.from(c.data) })))
  };
  function pubKeyBytes(key2) {
    return Array.from(key2.publicKey());
  }
  async function buildEditionGenesisTx(opts) {
    const tokenSats = opts.terms.tokenSats ?? PHARLAP_OUTPUT_SATS;
    const ownerPub = opts.ownerPubKey ?? pubKeyBytes(opts.key);
    const tx1Ref = hexBytes(opts.tx1Ref);
    if (tx1Ref.length !== 32) throw new Error("buildEditionGenesisTx: tx1Ref must be a 32-byte txid hex");
    const tx = new Tx(2, [], [], 0);
    addFunding(tx, opts.funding);
    const editionVouts = [];
    for (let i = 0; i < (opts.mintCount ?? 1); i++) {
      const lock2 = buildEditionLock({
        tx1Ref,
        ownerPubKey: ownerPub,
        publisherPubKeyHash: opts.terms.publisherPubKeyHash,
        publisherFeeSats: opts.terms.publisherFeeSats,
        holderFeeSats: opts.terms.holderFeeSats,
        tokenSats
      });
      editionVouts.push(tx.outputs.length);
      tx.outputs.push({ value: tokenSats, script: Uint8Array.from(lock2.toBinary()) });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    applyFee(tx, {
      inputValues: opts.funding.map((f) => f.utxo.satoshis),
      unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, opts.key, opts.funding);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return { tx, txId: tx.txid(), editionVouts, changeVout: changeSats > 0 ? changeVout : null, changeSats };
  }
  var covenantPreimage = (tx, inputIndex, subscript, sourceSatoshis, scope) => Array.from(preimage(tx, inputIndex, Uint8Array.from(subscript), sourceSatoshis, scope));
  var enforcedSliceBytes = (tx, enforced) => tx.outputs.slice(enforced).flatMap((o) => serializeOutput(o.value, Array.from(o.script)));
  function assertExactLength(sized, actual, what) {
    if (sized !== actual) {
      throw new Error(`${what}: unlock length moved between fee and signing (${sized} \u2192 ${actual}) \u2014 the fee would be wrong`);
    }
  }
  function assertNotLonger(sized, actual, what) {
    if (actual > sized) {
      throw new Error(`${what}: unlock came out LONGER than the fee allowed for (${sized} \u2192 ${actual}) \u2014 the fee is short`);
    }
  }
  var MAX_SIG_LEN = 73;
  function replicateUnlock(tx, inputIndex, opts) {
    const pre = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE);
    const buyerChange = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 4);
    return UnlockingScript2.from(editionReplicateUnlockChunks({ buyerPubKey: opts.buyerPubKey, buyerChange, preimage: pre })).toBinary();
  }
  function transferUnlock(tx, inputIndex, opts) {
    const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE);
    const ownerSig = opts.forSizing === true ? new Array(MAX_SIG_LEN).fill(0) : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID));
    const change = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 1);
    return UnlockingScript2.from(editionTransferUnlockChunks({
      newOwnerPubKey: opts.newOwnerPubKey,
      ownerSig,
      change,
      preimage: introspection
    })).toBinary();
  }
  function burnUnlock(tx, inputIndex, opts) {
    const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE);
    const ownerSig = opts.forSizing === true ? new Array(MAX_SIG_LEN).fill(0) : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID));
    return UnlockingScript2.from(editionBurnUnlockChunks({ ownerSig, preimage: introspection })).toBinary();
  }
  async function buildReplicateTx(opts) {
    const bond = opts.edition.satoshis;
    const lockBytes = opts.edition.lockBytes;
    const holderPub = editionOwnerPubKey(lockBytes);
    const buyerPub = opts.ownerPubKey ?? pubKeyBytes(opts.buyerKey);
    const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex;
    const tx = new Tx(2, [], [], 0);
    tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 4294967295 });
    addFunding(tx, opts.funding);
    tx.outputs.push({ value: bond, script: Uint8Array.from(lockBytes) });
    tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, buyerPub)) });
    tx.outputs.push({ value: opts.terms.publisherFeeSats, script: Uint8Array.from(p2pkhScript2(opts.terms.publisherPubKeyHash)) });
    tx.outputs.push({ value: opts.terms.holderFeeSats, script: Uint8Array.from(p2pkhScript2(hash160Bytes(holderPub))) });
    if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
      tx.outputs.push({
        value: PHARLAP_OUTPUT_SATS,
        script: Uint8Array.from(buildNoteScript(hexOf(buyerPub), { collectionRef: tx1RefHex, ...opts.note }).toBinary())
      });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.changeAddress != null ? scriptForAddress(opts.changeAddress) : opts.buyerKey.lockingScript() });
    const unlockOpts = { buyerPubKey: buyerPub, lockBytes, sourceSatoshis: bond };
    const sizedUnlock = replicateUnlock(tx, 0, unlockOpts).length;
    applyFee(tx, {
      inputValues: [bond, ...opts.funding.map((f) => f.utxo.satoshis)],
      unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    const finalUnlock = replicateUnlock(tx, 0, unlockOpts);
    assertExactLength(sizedUnlock, finalUnlock.length, "replicate");
    tx.inputs[0].script = finalUnlock;
    signFunding(tx, opts.buyerKey, opts.funding, 1);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return { tx, txId: tx.txid(), holderTokenVout: 0, replicaVout: 1, changeVout: changeSats > 0 ? changeVout : null };
  }
  async function buildEditionTransferTx(opts) {
    const bond = opts.edition.satoshis;
    const lockBytes = opts.edition.lockBytes;
    const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex;
    const tx = new Tx(2, [], [], 0);
    tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 4294967295 });
    addFunding(tx, opts.funding);
    tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, opts.newOwnerPubKey)) });
    tx.outputs.push({ value: 1, script: scriptForAddress(addressFromPubHex(hexOf(opts.newOwnerPubKey))) });
    if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
      tx.outputs.push({
        value: PHARLAP_OUTPUT_SATS,
        script: Uint8Array.from(buildNoteScript(hexOf(opts.newOwnerPubKey), { collectionRef: tx1RefHex, ...opts.note }).toBinary())
      });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.ownerKey.lockingScript() });
    const unlockOpts = { ownerKey: opts.ownerKey, newOwnerPubKey: opts.newOwnerPubKey, lockBytes, sourceSatoshis: bond };
    const sizedUnlock = transferUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length;
    applyFee(tx, {
      inputValues: [bond, ...opts.funding.map((f) => f.utxo.satoshis)],
      unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    const finalUnlock = transferUnlock(tx, 0, unlockOpts);
    assertNotLonger(sizedUnlock, finalUnlock.length, "transfer");
    tx.inputs[0].script = finalUnlock;
    signFunding(tx, opts.ownerKey, opts.funding, 1);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return { tx, txId: tx.txid(), tokenVout: 0, changeVout: changeSats > 0 ? changeVout : null };
  }
  async function toFundingInputs(_provider, utxos) {
    return utxos.map((u) => ({ utxo: u }));
  }
  async function createEdition(provider2, key2, params) {
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const mintCount = params.mintCount ?? 1;
    const ownerPub = params.ownerPubKey ?? pubKeyBytes(key2);
    const tokenSats = params.terms.tokenSats ?? PHARLAP_OUTPUT_SATS;
    const stateData = params.stateData ?? [];
    const templateLock = buildEditionLock({
      tx1Ref: new Array(32).fill(0),
      ownerPubKey: new Array(33).fill(0),
      publisherPubKeyHash: params.terms.publisherPubKeyHash,
      publisherFeeSats: params.terms.publisherFeeSats,
      holderFeeSats: params.terms.holderFeeSats,
      tokenSats
    });
    const encrypt2 = params.encrypt === true && params.file != null;
    let storedBytes = params.file?.bytes;
    let compressed = false;
    let wrappedKey;
    let keySalt;
    if (params.file != null) {
      const z = await compressIfSmaller(params.file.bytes, params.file.mimeType, params.file.fileName);
      storedBytes = z.bytes;
      compressed = z.compressed;
      if (encrypt2) {
        const K = newContentKey();
        keySalt = newKeySalt();
        storedBytes = await encryptContent(storedBytes, K);
        wrappedKey = await wrapContentKey(K, keySalt);
      }
    }
    const restrictions = RESTRICTION_REPLICABLE | (encrypt2 ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0);
    const template = {
      tokenName: params.tokenName,
      tokenRules: encodeTokenRules(0, 0, restrictions, 1),
      // supply 0 = unlimited / replicable
      covenantScript: hexOf(templateLock.toBinary()),
      // fileHash semantics: PUBLIC content binds the ORIGINAL plaintext (provenance — a verifier decompresses
      // the on-chain blob and matches H(plaintext); DEFLATE decompression is deterministic so the proof is
      // independent of the non-reproducible gzip encoding). ENCRYPTED content binds the ciphertext (privacy —
      // a public plaintext hash would be a confirmation oracle).
      fileHash: params.file == null ? void 0 : encrypt2 ? sha256Hex(storedBytes) : sha256Hex(params.file.bytes),
      wrappedKey,
      keySalt,
      license: params.license,
      licenseRef: params.licenseRef
    };
    const file = params.file != null ? { mimeType: params.file.mimeType, fileName: params.file.fileName, fileBytes: storedBytes } : void 0;
    const hasStorefront = params.description != null && params.description.length > 0 || params.cover != null;
    const storefront = hasStorefront ? {
      description: params.description ?? "",
      coverMimeType: params.cover?.mimeType,
      coverFileName: params.cover?.fileName,
      coverBytes: params.cover?.bytes,
      // A back cover only makes sense alongside a front cover (the codec keys "has back" off the bytes).
      backCoverMimeType: params.cover != null ? params.backCover?.mimeType : void 0,
      backCoverFileName: params.cover != null ? params.backCover?.fileName : void 0,
      backCoverBytes: params.cover != null ? params.backCover?.bytes : void 0
    } : void 0;
    const editionBytes = 800;
    const tx1Bytes = 500 + templateLock.toBinary().length + (file ? file.fileBytes.length : 0) + (params.cover ? params.cover.bytes.length : 0);
    const tx2Bytes = 300 + mintCount * editionBytes;
    const estFee = Math.ceil((tx1Bytes + tx2Bytes) * feePerKb / 1e3);
    const target = (1 + mintCount) * tokenSats + estFee + Math.max(1e3, Math.ceil(estFee * 0.2));
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    const funding = await toFundingInputs(provider2, selected);
    const t1 = await buildTemplateTx({ key: key2, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: tokenSats, feePerKb });
    if (t1.changeVout == null) throw new Error("Insufficient funding: template tx left no change to fund the edition mint.");
    const t2Funding = [{
      utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: "" }
    }];
    const t2 = await buildEditionGenesisTx({
      key: key2,
      funding: t2Funding,
      tx1Ref: t1.tx1Id,
      terms: params.terms,
      ownerPubKey: ownerPub,
      mintCount,
      feePerKb
    });
    if (params.confirmSpend != null && !await params.confirmSpend(spentSats(selected, t2.changeSats))) {
      throw new Error(SPEND_CANCELLED);
    }
    await provider2.broadcast(t1.tx.hex(), { awaitSeen: true });
    provider2.registerPendingTx(
      t1.tx1Id,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      { outputIndex: t1.changeVout, satoshis: t1.changeSats }
    );
    await provider2.broadcast(t2.tx.hex());
    provider2.registerPendingTx(
      t2.txId,
      [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
      t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : void 0
    );
    const editions = t2.editionVouts.map((v) => ({
      txId: t2.txId,
      outputIndex: v,
      lockHex: hexOf(Array.from(t2.tx.outputs[v].script))
    }));
    return { collectionId: t1.tx1Id, tx1Id: t1.tx1Id, tx2Id: t2.txId, editions };
  }
  async function replicateEdition(provider2, buyerKey, params) {
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const lockBytes = hexBytes(params.editionLockHex);
    const sourceTx = await provider2.getSourceTransaction(params.editionTxId);
    const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS;
    const edition = {
      txId: params.editionTxId,
      outputIndex: params.editionOutputIndex,
      satoshis: bond,
      lockBytes
    };
    const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0;
    const estFee = Math.ceil(1500 * feePerKb / 1e3);
    const target = bond + noteSats + params.terms.publisherFeeSats + params.terms.holderFeeSats + estFee + 1e3;
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    const funding = await toFundingInputs(provider2, selected);
    const rep = await buildReplicateTx({ edition, terms: params.terms, buyerKey, funding, note: params.note, feePerKb });
    const repChange = rep.changeVout != null ? rep.tx.outputs[rep.changeVout]?.value ?? 0 : 0;
    if (params.confirmSpend != null && !await params.confirmSpend(spentSats(selected, repChange))) {
      throw new Error(SPEND_CANCELLED);
    }
    await provider2.broadcast(rep.tx.hex());
    provider2.registerPendingTx(
      rep.txId,
      [
        { txId: params.editionTxId, outputIndex: params.editionOutputIndex },
        ...selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex }))
      ],
      rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : void 0
    );
    return {
      txId: rep.txId,
      replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
      lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script))
    };
  }
  function deriveVoucherKey(publisherKey, tx1RefHex, index) {
    const idx = [index & 255, index >> 8 & 255, index >> 16 & 255, index >> 24 & 255];
    const seed = [...Array.from(beBytes(publisherKey.d, 32)), ...hexBytes(tx1RefHex), ...idx];
    return Signer.fromPrivateKey(Uint8Array.from(sha256Bytes(seed)));
  }
  async function createGiftVouchers(provider2, publisherKey, params) {
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const count = Math.max(1, Math.floor(params.count));
    const keys = Array.from({ length: count }, (_, i) => deriveVoucherKey(publisherKey, params.tx1RefHex, params.startIndex + i));
    const estFee = Math.ceil((250 + count * 35) * feePerKb / 1e3);
    const target = count * params.fundEachSats + estFee + 500;
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    if (selected.length === 0) throw new Error("Insufficient funds to create the gift vouchers.");
    const funding = await toFundingInputs(provider2, selected);
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    for (const k of keys) {
      tx.outputs.push({ value: params.fundEachSats, script: scriptForAddress(k.address()) });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: publisherKey.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: feePerKb
    });
    signFunding(tx, publisherKey, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[changeVout]?.value ?? 0) > 0 ? { outputIndex: changeVout, satoshis: tx.outputs[changeVout].value ?? 0 } : void 0
    );
    return { fundingTxId: txId, voucherWifs: keys.map((k) => k.toWif()) };
  }
  async function scanGiftVouchers(provider2, publisherKey, tx1RefHex, opts) {
    const gapLimit = opts?.gapLimit ?? 5;
    const max = opts?.max ?? 1e3;
    const live = [];
    let claimedCount = 0;
    let nextIndex = 0;
    let consecutiveEmpty = 0;
    for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
      const k = deriveVoucherKey(publisherKey, tx1RefHex, i);
      const script = p2pkhScript2(hash160Bytes(Array.from(k.publicKey())));
      let unspent = [];
      try {
        unspent = await provider2.getUnspentByScriptHash(wocScriptHash(script));
      } catch {
      }
      let funded = unspent.length > 0;
      if (!funded) {
        try {
          funded = (await provider2.getAddressHistory(k.address())).length > 0;
        } catch {
        }
        if (!funded) {
          try {
            funded = (await provider2.getRecentTxIdsForAddress(k.address())).length > 0;
          } catch {
          }
        }
      }
      if (!funded) {
        consecutiveEmpty++;
        continue;
      }
      consecutiveEmpty = 0;
      nextIndex = i + 1;
      if (unspent.length > 0) live.push({ index: i, wif: k.toWif() });
      else claimedCount++;
    }
    return { nextIndex, live, claimedCount };
  }
  async function scanVoucherHashes(provider2, publisherKey, tx1RefHex, opts) {
    const gapLimit = opts?.gapLimit ?? 5;
    const max = opts?.max ?? 1e3;
    const hashes = /* @__PURE__ */ new Set();
    let consecutiveEmpty = 0;
    for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
      const k = deriveVoucherKey(publisherKey, tx1RefHex, i);
      const pkh = hash160Bytes(Array.from(k.publicKey()));
      let funded = false;
      try {
        funded = (await provider2.getUnspentByScriptHash(wocScriptHash(p2pkhScript2(pkh)))).length > 0;
      } catch {
      }
      if (!funded) {
        try {
          funded = (await provider2.getAddressHistory(k.address())).length > 0;
        } catch {
        }
        if (!funded) {
          try {
            funded = (await provider2.getRecentTxIdsForAddress(k.address())).length > 0;
          } catch {
          }
        }
      }
      if (!funded) {
        consecutiveEmpty++;
        continue;
      }
      consecutiveEmpty = 0;
      hashes.add(hexOf(pkh).toLowerCase());
    }
    return hashes;
  }
  async function sweepGiftVouchers(provider2, publisherKey, live, opts) {
    const tx = new Tx(1, [], [], 0);
    const spends = [];
    let swept = 0;
    for (const v of live) {
      const k = Signer.fromWif(v.wif);
      const script = p2pkhScript2(hash160Bytes(Array.from(k.publicKey())));
      let utxos = [];
      try {
        utxos = await provider2.getUnspentByScriptHash(wocScriptHash(script));
      } catch {
        continue;
      }
      let any = false;
      for (const u of utxos) {
        tx.inputs.push({ txid: txidToWire(u.txId), vout: u.outputIndex, script: new Uint8Array(0), sequence: 4294967295 });
        spends.push({ key: k, satoshis: u.satoshis });
        any = true;
      }
      if (any) swept++;
    }
    if (spends.length === 0) return null;
    tx.outputs.push({ value: 0, script: publisherKey.lockingScript() });
    applyFee(tx, {
      inputValues: spends.map((sp) => sp.satoshis),
      unlockingSizes: spends.map(() => UNLOCK_P2PKH),
      changeVout: 0,
      satPerKb: opts?.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    spends.forEach((sp, i) => {
      tx.inputs[i].script = sp.key.unlockP2PKH(tx, i, sp.key.lockingScript(), sp.satoshis);
    });
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    const reclaimedSats = tx.outputs[0]?.value ?? 0;
    provider2.registerPendingTx(txId, [], reclaimedSats > 0 ? { outputIndex: 0, satoshis: reclaimedSats } : void 0);
    return { swept, reclaimedSats, txId };
  }
  async function claimGiftEdition(provider2, ownerKey, params) {
    const giftKey = Signer.fromWif(params.giftWif);
    const giftScript = p2pkhScript2(hash160Bytes(Array.from(giftKey.publicKey())));
    const giftUtxos = await provider2.getUnspentByScriptHash(wocScriptHash(giftScript));
    if (giftUtxos.length === 0) throw new Error("This free copy has already been claimed.");
    const funding = await toFundingInputs(provider2, giftUtxos);
    const lockBytes = hexBytes(params.editionLockHex);
    const parsed = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)));
    if (parsed == null) throw new Error("claimGiftEdition: not an edition covenant");
    const sourceTx = params.editionSourceTx ?? await provider2.getSourceTransaction(params.editionTxId);
    const tokenSats = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS;
    const edition = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: tokenSats, lockBytes };
    const ownerPub = Array.from(ownerKey.publicKey());
    const changeAddress = ownerKey.address();
    let rep;
    {
      const terms = {
        publisherPubKeyHash: parsed.terms.publisherPubKeyHash,
        publisherFeeSats: parsed.terms.publisherFeeSats,
        holderFeeSats: parsed.terms.holderFeeSats,
        tokenSats
      };
      rep = await buildReplicateTx({ edition, terms, buyerKey: giftKey, funding, ownerPubKey: ownerPub, changeAddress, note: params.note, feePerKb: params.feePerKb });
    }
    await provider2.broadcast(rep.tx.hex());
    provider2.registerPendingTx(
      rep.txId,
      [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }, ...giftUtxos.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex }))],
      rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : void 0
    );
    return {
      txId: rep.txId,
      replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
      lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script))
    };
  }
  async function transferEdition(provider2, ownerKey, params) {
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const lockBytes = hexBytes(params.editionLockHex);
    const sourceTx = await provider2.getSourceTransaction(params.editionTxId);
    const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS;
    const edition = {
      txId: params.editionTxId,
      outputIndex: params.editionOutputIndex,
      satoshis: bond,
      lockBytes
    };
    const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0;
    const estFee = Math.ceil(1500 * feePerKb / 1e3);
    const selected = selectFunding(await getSafeUtxos(provider2), noteSats + estFee + 1e3);
    const funding = await toFundingInputs(provider2, selected);
    const xfer = await buildEditionTransferTx({
      edition,
      ownerKey,
      newOwnerPubKey: params.newOwnerPubKey,
      funding,
      note: params.note,
      feePerKb
    });
    await provider2.broadcast(xfer.tx.hex());
    provider2.registerPendingTx(
      xfer.txId,
      [
        { txId: params.editionTxId, outputIndex: params.editionOutputIndex },
        ...selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex }))
      ],
      xfer.changeVout != null ? { outputIndex: xfer.changeVout, satoshis: xfer.tx.outputs[xfer.changeVout].value ?? 0 } : void 0
    );
    return {
      txId: xfer.txId,
      tokenOutpoint: { txId: xfer.txId, outputIndex: xfer.tokenVout },
      lockHex: hexOf(Array.from(xfer.tx.outputs[xfer.tokenVout].script))
    };
  }
  async function buildEditionBurnTx(opts) {
    const lockBytes = opts.edition.lockBytes;
    const reclaimAddress = opts.reclaimAddress ?? opts.ownerKey.address();
    const tx = new Tx(2, [], [], 0);
    tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 4294967295 });
    tx.outputs.push({ value: 0, script: scriptForAddress(reclaimAddress) });
    const unlockOpts = { ownerKey: opts.ownerKey, lockBytes, sourceSatoshis: opts.edition.satoshis };
    const sizedUnlock = burnUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length;
    applyFee(tx, {
      inputValues: [opts.edition.satoshis],
      unlockingSizes: [sizedUnlock],
      changeVout: 0,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    const finalUnlock = burnUnlock(tx, 0, unlockOpts);
    assertNotLonger(sizedUnlock, finalUnlock.length, "burn");
    tx.inputs[0].script = finalUnlock;
    return { tx, txId: tx.txid(), reclaimVout: 0, reclaimSats: tx.outputs[0]?.value ?? 0 };
  }
  async function burnEdition(provider2, ownerKey, params) {
    const lockBytes = hexBytes(params.editionLockHex);
    const sourceTx = await provider2.getSourceTransaction(params.editionTxId);
    const satoshis = sourceTx.outputs[params.editionOutputIndex]?.value ?? 0;
    const edition = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis, lockBytes };
    const r = await buildEditionBurnTx({ edition, ownerKey, feePerKb: params.feePerKb });
    await provider2.broadcast(r.tx.hex());
    provider2.registerPendingTx(
      r.txId,
      [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }],
      r.reclaimSats > 0 ? { outputIndex: r.reclaimVout, satoshis: r.reclaimSats } : void 0
    );
    return { txId: r.txId, reclaimSats: r.reclaimSats };
  }
  function wocScriptHash(scriptBytes) {
    return hexOf(sha256Bytes(scriptBytes).reverse());
  }
  async function resolveHolderEdition(provider2, params) {
    const tx1Ref = hexBytes(params.tx1RefHex);
    const ownerPub = hexBytes(params.holderPubKeyHex);
    const templateBytes = hexBytes(params.templateCovenantHex);
    const lockBytes = buildHolderEditionScript(templateBytes, tx1Ref, ownerPub);
    const lockScript = LockingScript.fromHex(hexOf(lockBytes));
    const ed = parseEditionScript(lockScript);
    if (ed == null) throw new Error("resolveHolderEdition: reconstructed script is not a valid edition");
    const unspent = await provider2.getUnspentByScriptHash(wocScriptHash(lockBytes));
    if (unspent.length === 0) return null;
    const pick = unspent.find((u) => u.satoshis > 0) ?? unspent[0];
    return {
      txId: pick.txId,
      outputIndex: pick.outputIndex,
      lockHex: hexOf(lockBytes),
      terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: pick.satoshis },
      tokenSats: pick.satoshis
    };
  }
  async function scanIncomingEditions(provider2, pubKeyHex2, cache) {
    const mine = pubKeyHex2.toLowerCase();
    const cand = /* @__PURE__ */ new Map();
    try {
      for (const e of await provider2.getAddressHistory()) cand.set(e.txId, e.blockHeight || 0);
    } catch {
    }
    try {
      for (const u of await provider2.getUtxos()) if (!cand.has(u.txId)) cand.set(u.txId, u.height || 0);
    } catch {
    }
    const scripts = new Map(cache?.scripts ?? []);
    const since = cache?.sinceHeight ?? -1;
    for (const [txId, h] of cand) {
      if (since >= 0 && h > 0 && h <= since) continue;
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const ed = parseEditionScript(o.lockingScript);
        if (ed == null || ed.ownerPubKeyHex.toLowerCase() !== mine) continue;
        scripts.set(hexOf(Array.from(o.script)), ed.tx1RefHex);
      }
    }
    if (cache) for (const [k, v] of scripts) cache.scripts.set(k, v);
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [lockHex, tx1RefHex] of scripts) {
      const lockBytes = hexBytes(lockHex);
      let unspent;
      try {
        unspent = await provider2.getUnspentByScriptHash(wocScriptHash(lockBytes));
      } catch {
        continue;
      }
      const ed = parseEditionScript(LockingScript.fromHex(lockHex));
      if (ed == null) continue;
      for (const u of unspent) {
        const key2 = `${u.txId}:${u.outputIndex}`;
        if (seen.has(key2)) continue;
        seen.add(key2);
        let note = null;
        try {
          note = readNoteFromTx(await provider2.getSourceTransaction(u.txId), tx1RefHex);
        } catch {
        }
        found.push({
          txId: u.txId,
          outputIndex: u.outputIndex,
          lockHex,
          tx1RefHex,
          terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: u.satoshis ?? PHARLAP_OUTPUT_SATS },
          ...note ? { sellerNote: note } : {},
          ...u.height ? { height: u.height } : {}
        });
      }
    }
    return found;
  }
  async function scanCollectionBuyers(provider2, params) {
    const want = params.publisherPubKeyHashHex.toLowerCase();
    const cap = params.maxTxs ?? 400;
    const candidates = /* @__PURE__ */ new Map();
    let capped = false;
    try {
      let hist = await provider2.getAddressHistory();
      if (hist.length > cap) {
        capped = true;
        hist = hist.slice(hist.length - cap);
      }
      for (const h of hist) candidates.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const u of await provider2.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0);
    } catch {
    }
    const entries = [...candidates.entries()];
    const byBuyer = /* @__PURE__ */ new Map();
    let done = 0;
    for (const [txId, blockHeight] of entries) {
      params.onProgress?.(done, entries.length);
      done++;
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      const replica = tx.outputs[1];
      if (replica == null) continue;
      const ed = parseEditionScript(replica.lockingScript);
      if (ed == null || ed.tx1RefHex !== params.collectionId) continue;
      if (hexOf(ed.terms.publisherPubKeyHash).toLowerCase() !== want) continue;
      const buyerBytes = hexBytes(ed.ownerPubKeyHex);
      if (hexOf(hash160Bytes(buyerBytes)).toLowerCase() === want) continue;
      const k = ed.ownerPubKeyHex.toLowerCase();
      const h = blockHeight || 0;
      const rec = byBuyer.get(k);
      if (rec != null) {
        rec.count++;
        if (h) {
          rec.lastHeight = Math.max(rec.lastHeight, h);
          rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h;
        }
      } else byBuyer.set(k, { pubKeyHex: ed.ownerPubKeyHex, count: 1, firstHeight: h, lastHeight: h });
    }
    params.onProgress?.(entries.length, entries.length);
    const buyers = [...byBuyer.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity));
    return { buyers, scanned: entries.length, capped };
  }
  async function scanMySales(provider2, params) {
    const me = params.myPubKeyHex.toLowerCase();
    const myHash = params.myHash.toLowerCase();
    const cap = params.maxTxs ?? 500;
    const since = params.sinceHeight ?? -1;
    const candidates = /* @__PURE__ */ new Map();
    let capped = false;
    try {
      let hist = await provider2.getAddressHistory();
      if (hist.length > cap) {
        capped = true;
        hist = hist.slice(hist.length - cap);
      }
      for (const h of hist) candidates.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const u of await provider2.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0);
    } catch {
    }
    const entries = [...candidates.entries()].filter(([, h]) => !(since >= 0 && h > 0 && h <= since));
    const OUT_CAP = 256 * 1024;
    const sales = [];
    let done = 0;
    for (const [txId, blockHeight] of entries) {
      params.onProgress?.(done, entries.length);
      done++;
      let hex1;
      try {
        hex1 = await provider2.getOutputScriptHexCapped(txId, 1, OUT_CAP);
      } catch {
        continue;
      }
      if (hex1 == null || hex1 === "oversized") continue;
      let ed;
      try {
        ed = parseEditionScript(LockingScript.fromHex(hex1));
      } catch {
        continue;
      }
      if (ed == null) continue;
      const buyerHex = ed.ownerPubKeyHex;
      const cid = ed.tx1RefHex;
      const publisherHash = hexOf(ed.terms.publisherPubKeyHash).toLowerCase();
      if (hexOf(hash160Bytes(hexBytes(buyerHex))).toLowerCase() === publisherHash) continue;
      const iPublish = publisherHash === myHash;
      let iSourced = false;
      try {
        const hex0 = await provider2.getOutputScriptHexCapped(txId, 0, OUT_CAP);
        if (hex0 != null && hex0 !== "oversized") {
          const src = parseEditionScript(LockingScript.fromHex(hex0));
          if (src != null && src.ownerPubKeyHex.toLowerCase() === me) iSourced = true;
        }
      } catch {
      }
      if (!iPublish && !iSourced) continue;
      const pubCut = ed.terms.publisherFeeSats;
      const holdCut = ed.terms.holderFeeSats;
      sales.push({
        txId,
        collectionId: cid,
        buyerPubKeyHex: buyerHex,
        height: blockHeight || 0,
        time: 0,
        publisherFeeSats: iPublish ? pubCut : 0,
        holderFeeSats: iSourced ? holdCut : 0
      });
    }
    params.onProgress?.(entries.length, entries.length);
    await Promise.all(sales.map(async (s) => {
      try {
        const c = await provider2.getTxConfirmation(s.txId);
        if (c?.time) s.time = c.time;
      } catch {
      }
    }));
    const creator = /* @__PURE__ */ new Map();
    const reseller = /* @__PURE__ */ new Map();
    const creatorEarn = /* @__PURE__ */ new Map();
    const resellerEarn = /* @__PURE__ */ new Map();
    const events = [];
    const bump = (g, cid, buyerHex, h) => {
      let m = g.get(cid);
      if (m == null) {
        m = /* @__PURE__ */ new Map();
        g.set(cid, m);
      }
      const k = buyerHex.toLowerCase();
      const rec = m.get(k);
      if (rec != null) {
        rec.count++;
        if (h) {
          rec.lastHeight = Math.max(rec.lastHeight, h);
          rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h;
        }
      } else m.set(k, { pubKeyHex: buyerHex, count: 1, firstHeight: h, lastHeight: h });
    };
    const addEarn = (m, cid, v) => {
      m.set(cid, (m.get(cid) ?? 0) + v);
    };
    for (const s of sales) {
      if (s.publisherFeeSats > 0) {
        bump(creator, s.collectionId, s.buyerPubKeyHex, s.height);
        addEarn(creatorEarn, s.collectionId, s.publisherFeeSats);
        events.push({ collectionId: s.collectionId, role: "creator", feeSats: s.publisherFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex });
      }
      if (s.holderFeeSats > 0) {
        bump(reseller, s.collectionId, s.buyerPubKeyHex, s.height);
        addEarn(resellerEarn, s.collectionId, s.holderFeeSats);
        events.push({ collectionId: s.collectionId, role: "reseller", feeSats: s.holderFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex });
      }
    }
    const toGroups = (g, earn) => [...g.entries()].map(([collectionId, m]) => {
      const buyers = [...m.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity));
      return { collectionId, sales: buyers.reduce((s, b) => s + b.count, 0), earnings: earn.get(collectionId) ?? 0, buyers };
    }).sort((a, b) => b.sales - a.sales);
    return { sales, asCreator: toGroups(creator, creatorEarn), asReseller: toGroups(reseller, resellerEarn), events, scanned: entries.length, capped };
  }

  // src/mockupIngest.ts
  function mimeFromName(name) {
    const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
    return ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "avif" ? "image/avif" : "image/webp";
  }
  function readMockupBundle(zipBytes) {
    const files = readStoreZip(zipBytes);
    if (files == null || files["mockup.json"] == null) return null;
    let recipe;
    try {
      recipe = JSON.parse(utf8Of(files["mockup.json"]));
    } catch {
      return null;
    }
    const roles = recipe.prop?.roles ?? {};
    const base = files[roles.base ?? "base.webp"];
    const designName = recipe.design ?? "design.webp";
    const design = files[designName];
    if (base == null || design == null) return null;
    const designMime = recipe.designMime ?? mimeFromName(designName);
    const maps = {};
    for (const role of ["mask", "shade", "disp"]) {
      const file = roles[role];
      if (file != null && files[file] != null) maps[role] = files[file];
    }
    return { base, design, designMime, maps, recipe };
  }
  function bundleToPropManifest(recipe, ratio) {
    const p = recipe.place;
    return {
      version: 1,
      ratio,
      fabric: recipe.fabric ?? 0.8,
      place: p == null ? null : { x: p.cx, y: p.cy, scale: p.w, rot: p.rot, skewX: p.skewX, skewY: p.skewY },
      quad: null,
      warp: recipe.prop?.warp ?? null,
      disp: null,
      mask: null,
      shade: null,
      dims: null,
      name: recipe.prop?.name ?? null,
      contour: recipe.contour && recipe.contour > 0 ? Math.round(recipe.contour) : null
    };
  }
  function productCoverPointer(propTxid) {
    const cover = {
      version: 1,
      prop: { tx: propTxid, index: null },
      design: null,
      // embedded — the product's storefront preview cover
      place: null,
      // geometry lives on the prop now
      warp: null
    };
    return packCover(cover);
  }
  async function mintMockupProduct(provider2, key2, opts) {
    let propTxid = opts.propTxid;
    if (propTxid == null) {
      const prop = await createCollection(provider2, key2, {
        tokenName: opts.propName ?? opts.recipe.prop?.name ?? "prop",
        supply: 1,
        mintCount: 1,
        file: { mimeType: "image/webp", fileName: "base.webp", bytes: opts.base },
        mockupManifest: packProp(bundleToPropManifest(opts.recipe, opts.ratio ?? 0))
      });
      propTxid = prop.collectionId;
    }
    const manifest = productCoverPointer(propTxid);
    const supply = opts.supply ?? 1;
    const dExt = opts.cleanDesign.mimeType === "image/png" ? "png" : opts.cleanDesign.mimeType === "image/jpeg" ? "jpg" : opts.cleanDesign.mimeType === "image/avif" ? "avif" : "webp";
    const file = { mimeType: opts.cleanDesign.mimeType, fileName: `design.${dExt}`, bytes: opts.cleanDesign.bytes };
    const cover = { mimeType: opts.previewDesign.mimeType, fileName: "preview.webp", bytes: opts.previewDesign.bytes };
    if (opts.covenant) {
      const product2 = await createEdition(provider2, key2, {
        tokenName: opts.productName,
        terms: opts.covenant.terms,
        mintCount: supply,
        file,
        cover,
        encrypt: opts.encrypt,
        description: opts.description,
        license: opts.license,
        mockupManifest: manifest,
        feePerKb: opts.feePerKb,
        confirmSpend: opts.confirmSpend
      });
      return { propTxid, productTxid: product2.collectionId, editions: product2.editions };
    }
    const product = await createCollection(provider2, key2, {
      tokenName: opts.productName,
      supply,
      mintCount: supply,
      file,
      encrypt: opts.encrypt,
      description: opts.description,
      cover,
      license: opts.license,
      mockupManifest: manifest,
      feePerKb: opts.feePerKb,
      confirmSpend: opts.confirmSpend
    });
    return { propTxid, productTxid: product.collectionId, tokenOutpoints: product.tokenOutpoints };
  }

  // src/payment.ts
  function assertValidAddress(addr) {
    try {
      scriptForAddress(addr);
    } catch {
      throw new Error("Invalid BSV address");
    }
  }
  async function buildPaymentTx(opts) {
    assertValidAddress(opts.toAddress);
    if (opts.funding.length === 0) throw new Error("No spendable funds");
    if (!opts.sendMax && (!Number.isFinite(opts.amountSats) || opts.amountSats < 1)) {
      throw new Error("Enter an amount of at least 1 sat");
    }
    const toScript = scriptForAddress(opts.toAddress);
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, opts.funding);
    let changeVout = null;
    let absorbVout;
    if (opts.sendMax) {
      absorbVout = 0;
      tx.outputs.push({ value: 0, script: toScript });
    } else {
      tx.outputs.push({ value: opts.amountSats, script: toScript });
      changeVout = tx.outputs.length;
      absorbVout = changeVout;
      tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    }
    applyFee(tx, {
      inputValues: opts.funding.map((f) => f.utxo.satoshis),
      unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
      changeVout: absorbVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, opts.key, opts.funding);
    const sentSats = opts.sendMax ? tx.outputs[0]?.value ?? 0 : opts.amountSats;
    if (sentSats < 1) throw new Error("Funds too small to cover the network fee");
    const changeSats = changeVout != null ? tx.outputs[changeVout]?.value ?? 0 : 0;
    return { tx, txId: tx.txid(), sentSats, changeVout: changeSats > 0 ? changeVout : null, changeSats };
  }
  async function gatherPaymentFunding(provider2, opts) {
    const safe = await getSafeUtxos(provider2);
    const feeHeadroom = Math.ceil(400 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB) / 1e3) + 200;
    const selected = opts.sendMax ? safe : selectFunding(safe, opts.amountSats + feeHeadroom);
    return selected.map((u) => ({ utxo: u }));
  }
  async function sendPayment(provider2, key2, opts) {
    const funding = await gatherPaymentFunding(provider2, opts);
    const result = await buildPaymentTx({ key: key2, funding, ...opts });
    await provider2.broadcast(result.tx.hex());
    provider2.registerPendingTx(
      result.txId,
      funding.map((f) => ({ txId: f.utxo.txId, outputIndex: f.utxo.outputIndex })),
      result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : void 0
    );
    return result;
  }

  // src/airgap.ts
  var AIRGAP_VERSION = 1;
  function buildAirgapRequest(action, edition, opts = {}) {
    return {
      v: AIRGAP_VERSION,
      action,
      edition: {
        txId: edition.txId,
        outputIndex: edition.outputIndex,
        satoshis: edition.satoshis,
        lockHex: hexOf(edition.lockBytes),
        sourceTxHex: edition.sourceTx.hex()
      },
      newOwnerPubKeyHex: opts.newOwnerPubKeyHex,
      note: opts.note,
      funding: opts.funding?.map((f) => ({
        txId: f.utxo.txId,
        outputIndex: f.utxo.outputIndex,
        satoshis: f.utxo.satoshis,
        sourceTxHex: f.sourceTx.hex()
      })),
      feePerKb: opts.feePerKb,
      summary: opts.summary
    };
  }
  function buildAirgapPaymentRequest(opts) {
    return {
      v: AIRGAP_VERSION,
      action: "payment",
      payment: { toAddress: opts.toAddress, amountSats: opts.amountSats, sendMax: opts.sendMax },
      funding: opts.funding.map((f) => ({
        txId: f.utxo.txId,
        outputIndex: f.utxo.outputIndex,
        satoshis: f.utxo.satoshis,
        sourceTxHex: f.sourceTx.hex()
      })),
      feePerKb: opts.feePerKb,
      summary: opts.summary
    };
  }
  function fundingFromRequest(req) {
    return (req.funding ?? []).map((f) => ({
      utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: "" },
      sourceTx: Tx.parse(f.sourceTxHex)
    }));
  }
  async function signAirgapRequest(req, key2) {
    if (req.v !== AIRGAP_VERSION) throw new Error(`unsupported air-gap request version ${req.v}`);
    if (req.action === "payment") {
      if (req.payment == null) throw new Error("payment request is missing payment details");
      const funding = fundingFromRequest(req);
      const mine = toHex(key2.lockingScript());
      for (const f of funding) {
        const out = f.sourceTx.outputs[f.utxo.outputIndex];
        if (out == null || toHex(out.script) !== mine) {
          throw new Error("this wallet does not own one of the funding inputs \u2014 cannot sign");
        }
      }
      const r = await buildPaymentTx({
        key: key2,
        toAddress: req.payment.toAddress,
        amountSats: req.payment.amountSats,
        sendMax: req.payment.sendMax,
        funding,
        feePerKb: req.feePerKb
      });
      return { txId: r.txId, rawTx: r.tx.hex() };
    }
    if (req.edition == null) throw new Error("request is missing the edition to spend");
    const edition = {
      txId: req.edition.txId,
      outputIndex: req.edition.outputIndex,
      satoshis: req.edition.satoshis,
      lockBytes: hexBytes(req.edition.lockHex)
    };
    const owner = hexOf(editionOwnerPubKey(edition.lockBytes)).toLowerCase();
    if (owner !== toHex(key2.publicKey()).toLowerCase()) {
      throw new Error("this wallet does not own that edition \u2014 cannot sign");
    }
    if (req.action === "burn") {
      const r = await buildEditionBurnTx({ edition, ownerKey: key2, feePerKb: req.feePerKb });
      return { txId: r.txId, rawTx: r.tx.hex() };
    }
    if (req.action === "transfer") {
      if (req.newOwnerPubKeyHex == null || req.newOwnerPubKeyHex.length === 0) throw new Error("transfer request is missing the recipient pubkey");
      const funding = fundingFromRequest(req);
      const r = await buildEditionTransferTx({
        edition,
        ownerKey: key2,
        newOwnerPubKey: hexBytes(req.newOwnerPubKeyHex),
        funding,
        note: req.note,
        feePerKb: req.feePerKb
      });
      return { txId: r.txId, rawTx: r.tx.hex() };
    }
    throw new Error(`unknown air-gap action: ${String(req.action)}`);
  }
  function encodeAirgapRequest(req) {
    return JSON.stringify(req, null, 2);
  }
  function decodeAirgapRequest(json) {
    const req = JSON.parse(json);
    if (req == null || typeof req !== "object") throw new Error("not an air-gap request");
    if (req.v !== AIRGAP_VERSION) throw new Error(`unsupported air-gap request version ${req.v}`);
    if (req.action !== "transfer" && req.action !== "burn" && req.action !== "payment") throw new Error("unknown air-gap action");
    if (req.action === "payment") {
      if (req.payment?.toAddress == null) throw new Error("malformed air-gap request (missing payment details)");
      if ((req.funding ?? []).length === 0) throw new Error("malformed air-gap request (payment has no funding inputs)");
    } else if (req.edition?.sourceTxHex == null || req.edition.lockHex == null) {
      throw new Error("malformed air-gap request (missing edition data)");
    }
    return req;
  }

  // src/cosign.ts
  var SIGNED_P2PKH_INPUT_BYTES = 107;
  var FEE_PER_KB_POLICY = 100;
  var FEE_PER_KB_NOTABLE = FEE_PER_KB_POLICY * 2;
  var FEE_PER_KB_ALARMING = FEE_PER_KB_POLICY * 10;
  var scriptHashOf = (script) => hexOf(sha256Bytes(Array.from(script)).reverse());
  function dataPayload(scriptHex) {
    const s = scriptHex.toLowerCase();
    const body = s.startsWith("006a") ? s.slice(4) : s.startsWith("6a") ? s.slice(2) : null;
    if (body == null) return null;
    try {
      const bytes = hexBytes(body);
      let i = 0, len = 0;
      const op3 = bytes[i++];
      if (op3 == null) return "";
      if (op3 <= 75) len = op3;
      else if (op3 === 76) len = bytes[i++] ?? 0;
      else if (op3 === 77) {
        len = (bytes[i++] ?? 0) | (bytes[i++] ?? 0) << 8;
      } else if (op3 === 78) {
        len = (bytes[i++] ?? 0) | (bytes[i++] ?? 0) << 8 | (bytes[i++] ?? 0) << 16 | (bytes[i++] ?? 0) << 24;
      } else return "";
      return utf8Of(bytes.slice(i, i + len));
    } catch {
      return "";
    }
  }
  function analyseCosign(rawTx, sources, address2, expect) {
    const tx = Tx.parse(rawTx);
    const mineLock = toHex(scriptForAddress(address2));
    const byId = /* @__PURE__ */ new Map();
    const blockers = [];
    const warnings = [];
    for (const s of sources) {
      let parsed;
      try {
        parsed = Tx.parse(s.sourceTxHex);
      } catch {
        blockers.push(`a supplied source transaction for ${s.txId.slice(0, 12)}\u2026 is not valid hex`);
        continue;
      }
      if (parsed.txid() !== s.txId) {
        blockers.push(`a source transaction does not hash to the txid it claims (${s.txId.slice(0, 12)}\u2026) \u2014 refusing`);
        continue;
      }
      byId.set(s.txId, parsed);
    }
    const inputs = tx.inputs.map((inp, index) => {
      const txId = wireToTxid(inp.txid);
      const outputIndex = inp.vout;
      const src = byId.get(txId) ?? null;
      const out = src?.outputs[outputIndex] ?? null;
      const complete = inp.script.length > 0;
      return {
        index,
        txId,
        outputIndex,
        satoshis: out?.value ?? null,
        mine: out != null && toHex(out.script) === mineLock,
        complete,
        scriptHash: out == null ? null : scriptHashOf(out.script)
      };
    });
    const spentBy = /* @__PURE__ */ new Map();
    inputs.forEach((i) => {
      if (i.scriptHash != null && !spentBy.has(i.scriptHash)) spentBy.set(i.scriptHash, i.index);
    });
    const outputs = tx.outputs.map((o, index) => {
      const hex = toHex(o.script);
      const text = dataPayload(hex);
      let kind = "script";
      let addr;
      if (text != null) kind = "data";
      else if (hex === mineLock) {
        kind = "yours";
        addr = address2;
      } else {
        const m = /^76a914([0-9a-f]{40})88ac$/.exec(hex.toLowerCase());
        if (m != null) {
          kind = "address";
          try {
            addr = b58check(Uint8Array.from([0, ...hexBytes(m[1])]));
          } catch {
            addr = void 0;
          }
        }
      }
      const scriptHash = scriptHashOf(o.script);
      const continuesInput = kind === "script" ? spentBy.get(scriptHash) : void 0;
      const from = continuesInput === void 0 ? null : inputs[continuesInput].satoshis;
      if (continuesInput !== void 0) kind = "continues";
      return {
        index,
        satoshis: o.value,
        kind,
        address: addr,
        text: text ?? void 0,
        scriptSize: o.script.length,
        scriptHash,
        ...continuesInput === void 0 ? {} : { continuesInput, addedSats: o.value - (from ?? 0) }
      };
    });
    const funding = outputs.filter((o) => o.continuesInput !== void 0).map((o) => ({
      outputIndex: o.index,
      inputIndex: o.continuesInput,
      scriptHash: o.scriptHash,
      from: inputs[o.continuesInput].satoshis ?? 0,
      to: o.satoshis,
      added: o.addedSats ?? 0
    }));
    const missing = inputs.filter((i) => i.satoshis == null);
    if (missing.length > 0) {
      blockers.push(
        `${missing.length} input${missing.length === 1 ? "" : "s"} ha${missing.length === 1 ? "s" : "ve"} no source transaction, so the fee cannot be worked out. Refusing to sign a transaction whose cost is unknown.`
      );
    }
    const totalIn = inputs.reduce((a, i) => a + (i.satoshis ?? 0), 0);
    const totalOut = outputs.reduce((a, o) => a + o.satoshis, 0);
    const fee2 = totalIn - totalOut;
    const size = rawTx.length / 2;
    const toSign = inputs.filter((i) => i.mine && !i.complete).map((i) => i.index);
    const signedSize = size + SIGNED_P2PKH_INPUT_BYTES * toSign.length;
    const feePerKb = signedSize > 0 ? Math.round(fee2 * 1e3 / signedSize) : 0;
    const youSpend = inputs.filter((i) => i.mine).reduce((a, i) => a + (i.satoshis ?? 0), 0);
    const youReceive = outputs.filter((o) => o.kind === "yours").reduce((a, o) => a + o.satoshis, 0);
    if (toSign.length === 0) {
      blockers.push(missing.length > 0 ? "no input could be matched to this wallet (some sources are missing, so this may be why)" : "no input in this transaction pays this wallet \u2014 there is nothing here for it to sign");
    }
    for (const i of inputs) {
      if (i.mine && i.complete) warnings.push(`input #${i.index + 1} already carries a signature and will be left alone`);
      if (!i.mine && !i.complete) {
        warnings.push(`input #${i.index + 1} is neither yours nor already signed \u2014 somebody else must sign it before this can be broadcast`);
      }
    }
    if (blockers.length === 0) {
      if (fee2 < 0) blockers.push("the outputs are worth more than the inputs \u2014 this transaction can never be valid");
      else if (feePerKb >= FEE_PER_KB_ALARMING) {
        warnings.push(`\u26A0 THE FEE IS ${fee2.toLocaleString()} SAT \u2014 ${feePerKb.toLocaleString()} sat/KB, over ${Math.round(feePerKb / FEE_PER_KB_POLICY)}\xD7 the standard rate. Outputs are fixed by whoever built this, so any surplus goes to the miner, not back to you. Check the change amount before signing.`);
      } else if (feePerKb >= FEE_PER_KB_NOTABLE) {
        warnings.push(`the fee is ${fee2.toLocaleString()} sat (${feePerKb.toLocaleString()} sat/KB) against a standard rate of ${FEE_PER_KB_POLICY}`);
      }
    }
    for (const f of funding) {
      const leaked = -f.added - Math.max(fee2, 0);
      if (leaked > 0) {
        warnings.push(`\u26A0 output #${f.outputIndex + 1} carries ${leaked.toLocaleString()} sat LESS than input #${f.inputIndex + 1} even after the fee \u2014 that value went to another output, not to the miner`);
      }
    }
    for (const o of outputs) {
      if (o.kind === "script" && o.satoshis > 0) {
        warnings.push(`output #${o.index + 1} pays ${o.satoshis.toLocaleString()} sat to a script this transaction does not otherwise touch (${o.scriptHash.slice(0, 12)}\u2026) \u2014 nothing here says what it is`);
      }
    }
    if (expect?.scriptHash != null) {
      const want = expect.scriptHash.toLowerCase();
      const hit = funding.find((f) => f.scriptHash.toLowerCase() === want);
      if (hit === void 0) {
        blockers.push(`this transaction does not add anything to ${want.slice(0, 12)}\u2026 \u2014 it funds ${funding.length === 0 ? "nothing it also spends" : funding.map((f) => f.scriptHash.slice(0, 12) + "\u2026").join(", ")}`);
      } else if (expect.maxFunding != null && hit.added > expect.maxFunding) {
        blockers.push(`this transaction adds ${hit.added.toLocaleString()} sat, more than the ${expect.maxFunding.toLocaleString()} sat expected`);
      }
    }
    return {
      size,
      signedSize,
      inputs,
      outputs,
      totalIn,
      totalOut,
      fee: fee2,
      feePerKb,
      youSpend,
      youReceive,
      youPay: youSpend - youReceive,
      toSign,
      warnings,
      blockers,
      funding
    };
  }
  async function cosignTransaction(rawTx, sources, key2, expect) {
    const address2 = key2.address();
    const analysis = analyseCosign(rawTx, sources, address2, expect);
    if (analysis.blockers.length > 0) throw new Error(analysis.blockers[0]);
    const tx = Tx.parse(rawTx);
    const script = key2.lockingScript();
    for (const i of analysis.toSign) {
      const value = analysis.inputs[i].satoshis;
      if (value == null) throw new Error(`cosign: input #${i + 1} has no known value \u2014 refusing to sign`);
      tx.inputs[i].script = key2.unlockP2PKH(tx, i, script, value);
    }
    return { txId: tx.txid(), rawTx: tx.hex(), analysis };
  }

  // src/transfer.ts
  async function buildTransferTx(opts) {
    const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS;
    const notify = opts.notify ?? true;
    const tokenOut = opts.tokenSourceTx.outputs[opts.tokenOutputIndex];
    const parsed = tokenOut ? parseTokenScript(LockingScript.fromBinary(tokenOut.script)) : null;
    if (!parsed || !tokenOut) throw new Error("buildTransferTx: source output is not a PHAR LAP token");
    const tokenFields = {
      tx1Ref: parsed.fields.tx1Ref,
      stateData: opts.newStateData ?? parsed.fields.stateData
    };
    const tx = new Tx(1, [], [], 0);
    tx.inputs.push({
      txid: txidToWire(opts.tokenSourceTx.txid()),
      vout: opts.tokenOutputIndex,
      script: new Uint8Array(0),
      sequence: 4294967295
    });
    addFunding(tx, opts.funding);
    tx.outputs.push({ value: sats, script: buildTokenScript(opts.recipientPubKeyHex, tokenFields).toBinary() });
    const recipientVout = 0;
    let notifyVout = null;
    if (notify) {
      const recipientAddress = addressFromPubHex(opts.recipientPubKeyHex);
      notifyVout = tx.outputs.length;
      tx.outputs.push({ value: 1, script: scriptForAddress(recipientAddress) });
    }
    let publisherNotifyVout = null;
    if (opts.notifyPublisher) {
      if (opts.publisherPubKeyHex == null) {
        throw new Error("buildTransferTx: notifyPublisher requires publisherPubKeyHex");
      }
      const publisherAddress = addressFromPubHex(opts.publisherPubKeyHex);
      publisherNotifyVout = tx.outputs.length;
      tx.outputs.push({ value: 1, script: scriptForAddress(publisherAddress) });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    applyFee(tx, {
      inputValues: [tokenOut.value, ...opts.funding.map((f) => f.utxo.satoshis)],
      unlockingSizes: [UNLOCK_SIZE, ...opts.funding.map(() => UNLOCK_P2PKH)],
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    tx.inputs[0].script = unlockScript(opts.key.d, tx, 0, tokenOut.script, tokenOut.value).toBinary();
    signFunding(tx, opts.key, opts.funding, 1);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return {
      tx,
      txId: tx.txid(),
      recipientVout,
      notifyVout,
      publisherNotifyVout,
      changeVout: changeSats > 0 ? changeVout : null,
      changeSats,
      tokenFields
    };
  }
  async function createTransfer(provider2, key2, opts) {
    const tokenSourceTx = await provider2.getSourceTransaction(opts.tokenTxId);
    const feeHeadroom = Math.ceil(500 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB) / 1e3) + 200;
    const selected = selectFunding(await getSafeUtxos(provider2), feeHeadroom);
    const funding = selected.map((u) => ({ utxo: u }));
    const result = await buildTransferTx({
      key: key2,
      tokenOutputIndex: opts.tokenOutputIndex,
      tokenSourceTx,
      recipientPubKeyHex: opts.recipientPubKeyHex,
      funding,
      newStateData: opts.newStateData,
      notify: opts.notify,
      notifyPublisher: opts.notifyPublisher,
      publisherPubKeyHex: opts.publisherPubKeyHex,
      outputSats: opts.outputSats,
      feePerKb: opts.feePerKb
    });
    await provider2.broadcast(result.tx.hex());
    provider2.registerPendingTx(
      result.txId,
      [
        { txId: opts.tokenTxId, outputIndex: opts.tokenOutputIndex },
        ...selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex }))
      ],
      result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : void 0
    );
    return result;
  }
  function findOwnedTokenOutputs(tx, ownerPubKeyHex) {
    const found = [];
    tx.outputs.forEach((o, i) => {
      const parsed = parseTokenScript(LockingScript.fromBinary(o.script));
      if (parsed != null && parsed.ownerPubKeyHex === ownerPubKeyHex) {
        found.push({ outputIndex: i, fields: parsed.fields });
      }
    });
    return found;
  }
  async function scanIncoming(provider2, myPubKeyHex) {
    const candidateTxIds = /* @__PURE__ */ new Set();
    try {
      for (const { txId } of await provider2.getAddressHistory()) candidateTxIds.add(txId);
    } catch {
    }
    try {
      for (const u of await provider2.getUtxos()) candidateTxIds.add(u.txId);
    } catch {
    }
    const found = [];
    for (const txId of candidateTxIds) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const { outputIndex, fields } of findOwnedTokenOutputs(tx, myPubKeyHex)) {
        found.push({ txId, outputIndex, fields });
      }
    }
    return found;
  }

  // src/album.ts
  var ALBUM_MIME = "application/x-pharlap-album";
  var MAX_ALBUM_TRACKS = 64;
  var MAGIC = [80, 76, 69, 80];
  var VERSION = 1;
  function packAlbum(tracks) {
    if (tracks.length === 0) throw new Error("an album needs at least one track");
    if (tracks.length > MAX_ALBUM_TRACKS) throw new Error(`an album can hold at most ${MAX_ALBUM_TRACKS} tracks`);
    const header = { v: VERSION, tracks: tracks.map((t) => ({ n: t.name, m: t.mimeType, l: t.bytes.length })) };
    const headerBytes = Array.from(new TextEncoder().encode(JSON.stringify(header)));
    const len = headerBytes.length >>> 0;
    const out = [...MAGIC, VERSION, len >>> 24 & 255, len >>> 16 & 255, len >>> 8 & 255, len & 255, ...headerBytes];
    for (const t of tracks) for (const b of t.bytes) out.push(b);
    return out;
  }
  function isAlbum(mimeType, bytes) {
    if (mimeType === ALBUM_MIME) return true;
    if (bytes != null && bytes.length >= 4 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] && bytes[2] === MAGIC[2] && bytes[3] === MAGIC[3]) return true;
    return false;
  }
  function parseAlbum(bytes) {
    if (bytes.length < 9) return null;
    for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) return null;
    const len = (bytes[5] << 24 | bytes[6] << 16 | bytes[7] << 8 | bytes[8]) >>> 0;
    const headEnd = 9 + len;
    if (headEnd > bytes.length) return null;
    let header;
    try {
      header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.slice(9, headEnd))));
    } catch {
      return null;
    }
    if (header == null || !Array.isArray(header.tracks)) return null;
    const tracks = [];
    let off = headEnd;
    for (const t of header.tracks) {
      const l = Math.max(0, Number(t.l) || 0);
      if (off + l > bytes.length) return null;
      tracks.push({
        name: String(t.n ?? "track"),
        mimeType: String(t.m ?? "application/octet-stream"),
        bytes: bytes.slice(off, off + l)
      });
      off += l;
    }
    return tracks;
  }

  // src/refManifest.ts
  var MANIFEST_MIME = "application/x-pharlap-refs";
  var MAX_MANIFEST_REFS = 24;
  var MAGIC2 = [80, 82, 69, 70];
  var VERSION2 = 1;
  var HEX64 = /^[0-9a-fA-F]{64}$/;
  function packManifest(refs) {
    if (refs.length === 0) throw new Error("a reference manifest needs at least one entry");
    if (refs.length > MAX_MANIFEST_REFS) throw new Error(`a reference manifest can hold at most ${MAX_MANIFEST_REFS} entries`);
    for (const r of refs) {
      if (!HEX64.test(r.id)) throw new Error(`reference id must be a 32-byte txid hex: ${r.id}`);
      if (!HEX64.test(r.hash)) throw new Error(`reference hash must be a 32-byte sha256 hex: ${r.hash}`);
    }
    const header = { v: VERSION2, refs: refs.map((r) => ({ i: r.id.toLowerCase(), h: r.hash.toLowerCase(), n: r.name, m: r.mimeType })) };
    const headerBytes = Array.from(new TextEncoder().encode(JSON.stringify(header)));
    const len = headerBytes.length >>> 0;
    return [...MAGIC2, VERSION2, len >>> 24 & 255, len >>> 16 & 255, len >>> 8 & 255, len & 255, ...headerBytes];
  }
  function isManifest(mimeType, bytes) {
    if (mimeType === MANIFEST_MIME) return true;
    if (bytes != null && bytes.length >= 4 && bytes[0] === MAGIC2[0] && bytes[1] === MAGIC2[1] && bytes[2] === MAGIC2[2] && bytes[3] === MAGIC2[3]) return true;
    return false;
  }
  function parseManifest(bytes) {
    if (bytes.length < 9) return null;
    for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC2[i]) return null;
    const len = (bytes[5] << 24 | bytes[6] << 16 | bytes[7] << 8 | bytes[8]) >>> 0;
    const headEnd = 9 + len;
    if (headEnd > bytes.length) return null;
    let header;
    try {
      header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.slice(9, headEnd))));
    } catch {
      return null;
    }
    if (header == null || !Array.isArray(header.refs) || header.refs.length === 0) return null;
    const refs = [];
    for (const r of header.refs) {
      const id = String(r.i ?? ""), hash = String(r.h ?? "");
      if (!HEX64.test(id) || !HEX64.test(hash)) return null;
      refs.push({ id: id.toLowerCase(), hash: hash.toLowerCase(), name: String(r.n ?? "track"), mimeType: String(r.m ?? "application/octet-stream") });
    }
    return refs;
  }

  // src/bmf.ts
  var BMF_MIME = "application/x.bmf";
  var HEX642 = /^[0-9a-f]{64}$/i;
  function toTxid(s) {
    const v = String(s ?? "").trim().split(":")[0].toLowerCase();
    return HEX642.test(v) ? v : null;
  }
  function fmtLrcTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    let cs = Math.round(sec * 100);
    const m = Math.floor(cs / 6e3);
    cs -= m * 6e3;
    const s = Math.floor(cs / 100);
    cs -= s * 100;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  function isBmf(mimeType, bytes) {
    if (mimeType === BMF_MIME || mimeType === "application/vnd.blockmedia+json") return true;
    if (bytes == null) return false;
    const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 256))).replace(/^﻿/, "").trimStart();
    if (head.startsWith("{") && /"bmf"\s*:/.test(head)) return true;
    if (/^#\s*bmf\s*:/im.test(head)) return true;
    return false;
  }
  function parseBmf(bytes) {
    const text = new TextDecoder().decode(new Uint8Array(bytes)).replace(/^﻿/, "").trim();
    if (text.startsWith("{")) {
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        return null;
      }
      if (j == null || !Array.isArray(j.scenes)) return null;
      const scenes2 = [];
      for (const s of j.scenes) {
        const t = Number(s?.t);
        if (!isFinite(t)) continue;
        scenes2.push({ t, tx: toTxid(s?.tx), name: String(s?.name ?? "scene") });
      }
      if (scenes2.length === 0) return null;
      const audio = j.audio != null ? { tx: toTxid(j.audio.tx), name: String(j.audio.name ?? "audio") } : null;
      return {
        audio,
        tempo: isFinite(Number(j.tempo)) && Number(j.tempo) > 0 ? Number(j.tempo) : null,
        license: j.license != null ? String(j.license) : null,
        attribution: j.attribution != null ? String(j.attribution) : null,
        scenes: scenes2.sort((a, b) => a.t - b.t)
      };
    }
    const scenes = [];
    let audioName = null;
    let tempo = null;
    let license = null;
    let attribution = null;
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^#\s*(audio|tempo|license|attribution)\s*:\s*(.+)$/i);
      if (h != null) {
        const key2 = h[1].toLowerCase(), val2 = h[2].trim();
        if (key2 === "audio") audioName = val2;
        else if (key2 === "tempo") {
          const v = Number(val2);
          tempo = isFinite(v) && v > 0 ? v : null;
        } else if (key2 === "license") license = val2;
        else attribution = val2;
        continue;
      }
      const m = line.match(/^\[(\d{1,2}):(\d{1,2}(?:\.\d{1,2})?)\](.+)$/);
      if (m != null) scenes.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), tx: null, name: m[3].trim() });
    }
    if (scenes.length === 0) return null;
    return { audio: audioName != null ? { tx: null, name: audioName } : null, tempo, license, attribution, scenes: scenes.sort((a, b) => a.t - b.t) };
  }

  // src/flacMeta.ts
  function u32(b, o) {
    return (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  }
  function parseFlacPictures(bytes) {
    if (bytes.length < 8 || bytes[0] !== 102 || bytes[1] !== 76 || bytes[2] !== 97 || bytes[3] !== 67) return [];
    const pics = [];
    let off = 4;
    for (let guard = 0; guard < 4096; guard++) {
      if (off + 4 > bytes.length) break;
      const header = bytes[off];
      const isLast = (header & 128) !== 0;
      const type = header & 127;
      const len = bytes[off + 1] << 16 | bytes[off + 2] << 8 | bytes[off + 3];
      const body = off + 4;
      if (body + len > bytes.length) break;
      if (type === 6) {
        const p = parsePictureBlock(bytes, body, body + len);
        if (p != null) pics.push(p);
      }
      off = body + len;
      if (isLast) break;
    }
    return pics;
  }
  var LYRIC_KEYS = /* @__PURE__ */ new Set(["LYRICS", "UNSYNCEDLYRICS", "SYNCEDLYRICS", "LYRICS-XXX"]);
  var u32le = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  function parseFlacLyrics(bytes) {
    if (bytes.length < 8 || bytes[0] !== 102 || bytes[1] !== 76 || bytes[2] !== 97 || bytes[3] !== 67) return null;
    let off = 4;
    for (let guard = 0; guard < 4096; guard++) {
      if (off + 4 > bytes.length) break;
      const header = bytes[off];
      const isLast = (header & 128) !== 0;
      const type = header & 127;
      const len = bytes[off + 1] << 16 | bytes[off + 2] << 8 | bytes[off + 3];
      const body = off + 4;
      if (body + len > bytes.length) break;
      if (type === 4) {
        const found = readVorbisLyrics(bytes, body, body + len);
        if (found != null) return found;
      }
      off = body + len;
      if (isLast) break;
    }
    return null;
  }
  function readVorbisLyrics(b, start, end) {
    const dec = new TextDecoder();
    let o = start;
    if (o + 4 > end) return null;
    o += 4 + u32le(b, o);
    if (o + 4 > end) return null;
    const count = u32le(b, o);
    o += 4;
    let fallback = null;
    for (let i = 0; i < count && i < 4096; i++) {
      if (o + 4 > end) break;
      const clen = u32le(b, o);
      o += 4;
      if (o + clen > end) break;
      const comment = dec.decode(new Uint8Array(b.slice(o, o + clen)));
      o += clen;
      const eq = comment.indexOf("=");
      if (eq <= 0) continue;
      const key2 = comment.slice(0, eq).toUpperCase();
      if (!LYRIC_KEYS.has(key2)) continue;
      const val2 = comment.slice(eq + 1);
      if (val2.trim() === "") continue;
      if (/\[\d{1,2}:\d{1,2}/.test(val2)) return val2;
      if (fallback == null) fallback = val2;
    }
    return fallback;
  }
  function parsePictureBlock(b, start, end) {
    let o = start;
    const dec = new TextDecoder();
    if (o + 4 > end) return null;
    const pictureType = u32(b, o);
    o += 4;
    if (o + 4 > end) return null;
    const mimeLen = u32(b, o);
    o += 4;
    if (o + mimeLen + 4 > end) return null;
    const mimeType = dec.decode(new Uint8Array(b.slice(o, o + mimeLen)));
    o += mimeLen;
    const descLen = u32(b, o);
    o += 4;
    if (o + descLen + 16 + 4 > end) return null;
    const description = dec.decode(new Uint8Array(b.slice(o, o + descLen)));
    o += descLen;
    o += 16;
    const dataLen = u32(b, o);
    o += 4;
    if (o + dataLen > end) return null;
    return { pictureType, mimeType, description, data: b.slice(o, o + dataLen) };
  }

  // src/id3.ts
  var syncsafe = (b, o) => (b[o] & 127) << 21 | (b[o + 1] & 127) << 14 | (b[o + 2] & 127) << 7 | b[o + 3] & 127;
  var u322 = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  var u24 = (b, o) => b[o] << 16 | b[o + 1] << 8 | b[o + 2];
  var latin1 = (b, s, e) => {
    let r = "";
    for (let i = s; i < e; i++) r += String.fromCharCode(b[i]);
    return r;
  };
  function normalizeMime(m) {
    const s = m.trim().toLowerCase();
    if (s.startsWith("image/")) return s;
    if (s.includes("png")) return "image/png";
    if (s.includes("jpg") || s.includes("jpeg")) return "image/jpeg";
    if (s.includes("gif")) return "image/gif";
    if (s.includes("webp")) return "image/webp";
    return "image/jpeg";
  }
  function skipDescription(b, o, end, encoding) {
    if (encoding === 1 || encoding === 2) {
      while (o + 1 < end) {
        if (b[o] === 0 && b[o + 1] === 0) return o + 2;
        o += 2;
      }
      return end;
    }
    while (o < end) {
      if (b[o] === 0) return o + 1;
      o++;
    }
    return end;
  }
  function parseApic(b, start, end) {
    let o = start;
    if (o >= end) return null;
    const encoding = b[o];
    o++;
    let m = o;
    while (m < end && b[m] !== 0) m++;
    const mimeType = latin1(b, o, m);
    o = m + 1;
    if (o >= end) return null;
    const pictureType = b[o];
    o++;
    o = skipDescription(b, o, end, encoding);
    if (o > end) return null;
    return { pictureType, mimeType: normalizeMime(mimeType), data: b.slice(o, end) };
  }
  function parsePic(b, start, end) {
    let o = start;
    if (o + 5 > end) return null;
    const encoding = b[o];
    o++;
    const fmt = latin1(b, o, o + 3);
    o += 3;
    const pictureType = b[o];
    o++;
    o = skipDescription(b, o, end, encoding);
    if (o > end) return null;
    return { pictureType, mimeType: normalizeMime(fmt), data: b.slice(o, end) };
  }
  function decodeText(b, start, end, encoding) {
    if (start >= end) return "";
    const u82 = new Uint8Array(b.slice(start, end));
    try {
      if (encoding === 1) return new TextDecoder("utf-16").decode(u82);
      if (encoding === 2) return new TextDecoder("utf-16be").decode(u82);
      if (encoding === 3) return new TextDecoder("utf-8").decode(u82);
    } catch {
    }
    return latin1(b, start, end);
  }
  function parseId3Lyrics(bytes) {
    if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51) return null;
    const major = bytes[3];
    const flags = bytes[5];
    if ((flags & 128) !== 0) return null;
    const end = Math.min(10 + syncsafe(bytes, 6), bytes.length);
    let o = 10;
    if ((flags & 64) !== 0) {
      if (o + 4 > end) return null;
      o += major >= 4 ? syncsafe(bytes, o) : u322(bytes, o) + 4;
    }
    const idLen = major === 2 ? 3 : 4;
    const hdrLen = major === 2 ? 6 : 10;
    const wantId = major === 2 ? "ULT" : "USLT";
    for (let guard = 0; guard < 4096 && o + hdrLen <= end; guard++) {
      if (bytes[o] === 0) break;
      const id = latin1(bytes, o, o + idLen);
      const frameSize = major === 2 ? u24(bytes, o + 3) : major >= 4 ? syncsafe(bytes, o + 4) : u322(bytes, o + 4);
      const fstart = o + hdrLen;
      if (frameSize <= 0 || fstart + frameSize > end) break;
      if (id === wantId) {
        const fend = fstart + frameSize;
        let p = fstart;
        const encoding = bytes[p];
        p += 1 + 3;
        p = skipDescription(bytes, p, fend, encoding);
        const text = decodeText(bytes, p, fend, encoding).replace(/ +$/, "").trim();
        if (text !== "") return text;
      }
      o = fstart + frameSize;
    }
    return null;
  }
  function parseId3Pictures(bytes) {
    if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51) return [];
    const major = bytes[3];
    const flags = bytes[5];
    if ((flags & 128) !== 0) return [];
    const end = Math.min(10 + syncsafe(bytes, 6), bytes.length);
    let o = 10;
    if ((flags & 64) !== 0) {
      if (o + 4 > end) return [];
      o += major >= 4 ? syncsafe(bytes, o) : u322(bytes, o) + 4;
    }
    const pics = [];
    const idLen = major === 2 ? 3 : 4;
    const hdrLen = major === 2 ? 6 : 10;
    for (let guard = 0; guard < 4096 && o + hdrLen <= end; guard++) {
      if (bytes[o] === 0) break;
      const id = latin1(bytes, o, o + idLen);
      const frameSize = major === 2 ? u24(bytes, o + 3) : major >= 4 ? syncsafe(bytes, o + 4) : u322(bytes, o + 4);
      const fstart = o + hdrLen;
      if (frameSize <= 0 || fstart + frameSize > end) break;
      if (major === 2 && id === "PIC") {
        const p = parsePic(bytes, fstart, fstart + frameSize);
        if (p != null) pics.push(p);
      } else if (id === "APIC") {
        const p = parseApic(bytes, fstart, fstart + frameSize);
        if (p != null) pics.push(p);
      }
      o = fstart + frameSize;
    }
    return pics;
  }

  // src/lyrics.ts
  function parseLyrics(raw) {
    if (raw == null || raw.trim() === "") return null;
    const rawLines = raw.replace(/\r/g, "").split("\n");
    const tsRe = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
    const synced = [];
    for (const line of rawLines) {
      tsRe.lastIndex = 0;
      const times = [];
      let m;
      while ((m = tsRe.exec(line)) != null) times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(":", ".")));
      if (times.length > 0) {
        const text = line.replace(/\[[^\]]*\]/g, "").trim();
        for (const t of times) synced.push({ t, text });
      }
    }
    if (synced.length > 0) {
      synced.sort((a, b) => a.t - b.t);
      return { synced: true, lines: synced };
    }
    const plain = rawLines.map((l) => l.trim()).filter((l) => l !== "").map((text) => ({ t: -1, text }));
    return plain.length > 0 ? { synced: false, lines: plain } : null;
  }

  // src/sceneTimeline.ts
  function resolveCue(cueText, available) {
    const parsed = parseLyrics(cueText);
    if (parsed == null || !parsed.synced) return null;
    const byName = /* @__PURE__ */ new Map();
    for (const a of available) {
      byName.set(a.toLowerCase(), a);
      byName.set(a.toLowerCase().replace(/^.*[/\\]/, ""), a);
    }
    const scenes = [];
    for (const l of parsed.lines) {
      const hit = byName.get(l.text.trim().toLowerCase());
      if (hit != null) scenes.push({ t: l.t, name: hit });
    }
    return scenes.length > 0 ? scenes : null;
  }

  // impl/js/ecies.mjs
  var MAGIC3 = fromUtf8("BIE1");
  var MAC_BYTES = 32;
  var EciesError = class extends Error {
  };
  function sharedSecret(priv, pub) {
    if (typeof priv !== "bigint") throw new EciesError("the private key is a BigInt scalar");
    const point = decodePoint(pub);
    if (point === null) throw new EciesError("the public key does not decode");
    return sha512(serP(mulBlinded(priv, point)));
  }
  var keysFrom = (H) => ({ iv: H.subarray(0, 16), keyE: H.subarray(16, 32), keyM: H.subarray(32, 64) });
  var importAes = (raw, use) => crypto.subtle.importKey("raw", raw, "AES-CBC", false, [use]);
  async function encrypt(msg, theirPub, ourPriv) {
    const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub));
    const key2 = await importAes(keyE, "encrypt");
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key2, msg));
    const body = concat(MAGIC3, ct);
    return concat(body, hmac(sha256, keyM, body));
  }
  async function decrypt(packed, ourPriv, theirPub) {
    if (!(packed instanceof Uint8Array)) throw new EciesError("expected bytes");
    if (packed.length < MAGIC3.length + 16 + MAC_BYTES)
      throw new EciesError("too short to hold a magic, one cipher block and a MAC");
    if (!timingSafeEquals(packed.subarray(0, MAGIC3.length), MAGIC3))
      throw new EciesError("not this message format");
    const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub));
    const body = packed.subarray(0, packed.length - MAC_BYTES);
    const mac = packed.subarray(packed.length - MAC_BYTES);
    if (!timingSafeEquals(hmac(sha256, keyM, body), mac))
      throw new EciesError("message authentication failed - wrong key, wrong sender, or altered in transit");
    const key2 = await importAes(keyE, "decrypt");
    try {
      return new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        key2,
        packed.subarray(MAGIC3.length, packed.length - MAC_BYTES)
      ));
    } catch {
      throw new EciesError("the message authenticated but its padding is malformed");
    }
  }

  // src/messageCodec.ts
  var hexBytesU8 = (hex) => Uint8Array.from(hexBytes(hex));
  var ENVELOPE_VERSION = 1;
  var FLAG_ENCRYPTED = 1;
  var FLAG_COMPRESSED = 2;
  var PART_TEXT = 1;
  var PART_KEY = 2;
  var PART_FILE_INLINE = 3;
  var PART_FILE_REF = 4;
  var PART_ALIAS = 5;
  var PART_TIME = 6;
  function encodeTimeMs(ms) {
    const out = [];
    let v = Math.max(0, Math.floor(ms));
    for (let i = 0; i < 6; i++) {
      out.push(v & 255);
      v = Math.floor(v / 256);
    }
    return out;
  }
  function decodeTimeMs(b) {
    let n = 0;
    for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i];
    return n;
  }
  function writeVarInt(n) {
    if (n < 253) return [n];
    if (n <= 65535) return [253, n & 255, n >> 8 & 255];
    if (n <= 4294967295) return [254, n & 255, n >> 8 & 255, n >> 16 & 255, n >> 24 & 255];
    throw new Error("writeVarInt: value too large");
  }
  function readVarInt(b, off) {
    const first = b[off];
    if (first < 253) return [first, off + 1];
    if (first === 253) return [b[off + 1] | b[off + 2] << 8, off + 3];
    if (first === 254) return [b[off + 1] | b[off + 2] << 8 | b[off + 3] << 16 | b[off + 4] << 24, off + 5];
    throw new Error("readVarInt: 64-bit lengths unsupported");
  }
  function lenPrefixed(bytes) {
    return [...writeVarInt(bytes.length), ...bytes];
  }
  function encodePartValue(p) {
    switch (p.kind) {
      case "text":
        return { type: PART_TEXT, value: utf8Bytes(p.text) };
      case "key":
        return { type: PART_KEY, value: [...p.key] };
      case "file":
        return {
          type: PART_FILE_INLINE,
          value: [...lenPrefixed(utf8Bytes(p.mimeType)), ...lenPrefixed(utf8Bytes(p.fileName)), ...p.bytes]
        };
      case "fileRef": {
        if (p.sha256.length !== 32) throw new Error("fileRef sha256 must be 32 bytes");
        return { type: PART_FILE_REF, value: [...p.sha256, ...utf8Bytes(p.uri)] };
      }
      case "alias":
        return { type: PART_ALIAS, value: utf8Bytes(p.alias) };
      case "time":
        return { type: PART_TIME, value: encodeTimeMs(p.ms) };
    }
  }
  function encodeParts(parts) {
    const out = [];
    for (const p of parts) {
      const { type, value } = encodePartValue(p);
      out.push(type, ...lenPrefixed(value));
    }
    return out;
  }
  function decodeParts(bytes) {
    const parts = [];
    let off = 0;
    try {
      while (off < bytes.length) {
        const type = bytes[off++];
        let len;
        [len, off] = readVarInt(bytes, off);
        const value = bytes.slice(off, off + len);
        if (value.length !== len) return null;
        off += len;
        switch (type) {
          case PART_TEXT:
            parts.push({ kind: "text", text: utf8Of(value) });
            break;
          case PART_KEY:
            parts.push({ kind: "key", key: value });
            break;
          case PART_FILE_INLINE: {
            let o = 0, mlen = 0, nlen = 0;
            [mlen, o] = readVarInt(value, o);
            const mime = value.slice(o, o + mlen);
            o += mlen;
            [nlen, o] = readVarInt(value, o);
            const name = value.slice(o, o + nlen);
            o += nlen;
            parts.push({ kind: "file", mimeType: utf8Of(mime), fileName: utf8Of(name), bytes: value.slice(o) });
            break;
          }
          case PART_FILE_REF:
            parts.push({ kind: "fileRef", sha256: value.slice(0, 32), uri: utf8Of(value.slice(32)) });
            break;
          case PART_ALIAS:
            parts.push({ kind: "alias", alias: utf8Of(value) });
            break;
          case PART_TIME:
            parts.push({ kind: "time", ms: decodeTimeMs(value) });
            break;
          default:
            return null;
        }
      }
    } catch {
      return null;
    }
    return parts;
  }
  async function buildEnvelope(opts) {
    const encrypt2 = opts.encrypt ?? true;
    const senderPub = Array.from(opts.senderPriv.publicKey(true));
    if (senderPub.length !== 33) throw new Error("senderPub must be 33 bytes");
    const sentAt = opts.sentAt != null && opts.sentAt > 0 ? opts.sentAt : Date.now();
    const meta = [{ kind: "time", ms: sentAt }];
    if (opts.senderAlias != null && opts.senderAlias !== "") meta.push({ kind: "alias", alias: opts.senderAlias });
    const allParts = [...meta, ...opts.parts];
    let payload = encodeParts(allParts);
    let flags = 0;
    const c = await compressIfSmaller(payload);
    if (c.compressed) {
      payload = c.bytes;
      flags |= FLAG_COMPRESSED;
    }
    const body = encrypt2 ? Array.from(await encrypt(Uint8Array.from(payload), hexBytesU8(opts.recipientPubKeyHex), opts.senderPriv.d)) : payload;
    if (encrypt2) flags |= FLAG_ENCRYPTED;
    return [ENVELOPE_VERSION, flags, ...senderPub, ...body];
  }
  function splitMeta(parts) {
    const aliasPart = parts.find((p) => p.kind === "alias");
    const timePart = parts.find((p) => p.kind === "time");
    return {
      senderAlias: aliasPart != null && aliasPart.kind === "alias" ? aliasPart.alias : void 0,
      sentAt: timePart != null && timePart.kind === "time" ? timePart.ms : void 0,
      parts: parts.filter((p) => p.kind !== "alias" && p.kind !== "time")
    };
  }
  async function openEnvelope(envelope, recipientPriv) {
    if (envelope.length < 35) return null;
    if (envelope[0] !== ENVELOPE_VERSION) return null;
    const encrypted = (envelope[1] & FLAG_ENCRYPTED) !== 0;
    const compressed = (envelope[1] & FLAG_COMPRESSED) !== 0;
    const senderPub = envelope.slice(2, 35);
    const senderPubKeyHex = hexOf(senderPub);
    const body = envelope.slice(35);
    let tlv;
    if (encrypted) {
      try {
        tlv = Array.from(await decrypt(Uint8Array.from(body), recipientPriv.d, hexBytesU8(senderPubKeyHex)));
      } catch {
        return null;
      }
    } else {
      tlv = body;
    }
    if (compressed) {
      try {
        tlv = await decompress(tlv);
      } catch {
        return null;
      }
    }
    const decoded = decodeParts(tlv);
    if (decoded == null) return null;
    const { senderAlias, sentAt, parts } = splitMeta(decoded);
    return { senderPubKeyHex, encrypted, parts, senderAlias, sentAt };
  }
  async function openPublicEnvelope(envelope) {
    if (envelope.length < 35 || envelope[0] !== ENVELOPE_VERSION) return null;
    if ((envelope[1] & FLAG_ENCRYPTED) !== 0) return null;
    const senderPubKeyHex = hexOf(envelope.slice(2, 35));
    let tlv = envelope.slice(35);
    if ((envelope[1] & FLAG_COMPRESSED) !== 0) {
      try {
        tlv = await decompress(tlv);
      } catch {
        return null;
      }
    }
    const decoded = decodeParts(tlv);
    if (decoded == null) return null;
    const { senderAlias, sentAt, parts } = splitMeta(decoded);
    return { senderPubKeyHex, encrypted: false, parts, senderAlias, sentAt };
  }

  // src/messageBuilder.ts
  var ZERO_REF = "00".repeat(32);
  async function buildMessageTx(opts) {
    const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS;
    const notify = opts.notify ?? true;
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, opts.funding);
    const messageVout = tx.outputs.length;
    tx.outputs.push({
      value: sats,
      script: buildMessageScript(opts.recipientPubKeyHex, { ref: opts.ref ?? ZERO_REF, envelope: opts.envelope }).toBinary()
    });
    let notifyVout = null;
    if (notify) {
      const recipientAddress = addressFromPubHex(opts.recipientPubKeyHex);
      notifyVout = tx.outputs.length;
      tx.outputs.push({ value: 1, script: scriptForAddress(recipientAddress) });
    }
    const changeVout = tx.outputs.length;
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() });
    applyFee(tx, {
      inputValues: opts.funding.map((f) => f.utxo.satoshis),
      unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, opts.key, opts.funding);
    const changeSats = tx.outputs[changeVout]?.value ?? 0;
    return { tx, txId: tx.txid(), messageVout, notifyVout, changeVout: changeSats > 0 ? changeVout : null, changeSats };
  }
  async function toFundingInputs2(_provider, utxos) {
    return utxos.map((u) => ({ utxo: u }));
  }
  async function sendMessage(provider2, key2, params) {
    const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB;
    const envelope = await buildEnvelope({
      senderPriv: key2,
      recipientPubKeyHex: params.toPubKeyHex,
      parts: params.parts,
      encrypt: params.encrypt,
      senderAlias: params.senderAlias,
      sentAt: params.sentAt ?? Date.now()
    });
    const estFee = Math.ceil((350 + envelope.length) * feePerKb / 1e3);
    const target = 2 * PHARLAP_OUTPUT_SATS + estFee + 500;
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    const funding = await toFundingInputs2(provider2, selected);
    const r = await buildMessageTx({
      key: key2,
      funding,
      recipientPubKeyHex: params.toPubKeyHex,
      ref: params.ref,
      envelope,
      feePerKb
    });
    await provider2.broadcast(r.tx.hex());
    provider2.registerPendingTx(
      r.txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      r.changeVout != null ? { outputIndex: r.changeVout, satoshis: r.changeSats } : void 0
    );
    return { txId: r.txId, messageOutpoint: { txId: r.txId, outputIndex: r.messageVout } };
  }
  async function scanIncomingMessages(provider2, recipientPriv) {
    const myPub = toHex(recipientPriv.publicKey()).toLowerCase();
    const candidateTxIds = /* @__PURE__ */ new Set();
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory()) {
        candidateTxIds.add(h.txId);
        heightByTx.set(h.txId, h.blockHeight || 0);
      }
    } catch {
    }
    try {
      for (const u of await provider2.getUtxos()) candidateTxIds.add(u.txId);
    } catch {
    }
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const txId of candidateTxIds) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (let i = 0; i < tx.outputs.length; i++) {
        const parsed = parseMessageScript(LockingScript.fromBinary(tx.outputs[i].script));
        if (parsed == null || parsed.recipientPubKeyHex.toLowerCase() !== myPub) continue;
        const key2 = `${txId}:${i}`;
        if (seen.has(key2)) continue;
        seen.add(key2);
        const opened = await openEnvelope(parsed.fields.envelope, recipientPriv);
        if (opened == null) continue;
        found.push({
          txId,
          outputIndex: i,
          ref: parsed.fields.ref,
          senderPubKeyHex: opened.senderPubKeyHex,
          encrypted: opened.encrypted,
          parts: opened.parts,
          senderAlias: opened.senderAlias,
          sentAt: opened.sentAt,
          height: heightByTx.get(txId) ?? 0
        });
      }
    }
    const rank = (m) => m.height != null && m.height > 0 ? m.height : Number.MAX_SAFE_INTEGER;
    return found.sort((a, b) => rank(b) - rank(a) || (b.sentAt ?? 0) - (a.sentAt ?? 0));
  }

  // src/preview.ts
  var MAX_PREVIEW_BYTES = 1048576;
  var MAX_HISTORY_SCAN2 = 30;
  async function publishPreview(provider2, key2, collectionId, clip) {
    if (clip.bytes.length === 0) throw new Error("preview clip is empty");
    if (clip.bytes.length > MAX_PREVIEW_BYTES) throw new Error(`preview exceeds ${MAX_PREVIEW_BYTES} bytes`);
    const mimeType = clip.mimeType || "audio/mpeg";
    const publisherPub = toHex(key2.publicKey());
    const estBytes = 300 + clip.bytes.length;
    const estFee = Math.ceil(estBytes * DEFAULT_FEE_PER_KB / 1e3);
    const target = PHARLAP_OUTPUT_SATS + estFee + Math.max(1e3, Math.ceil(estFee * 0.1));
    const selected = selectFunding(await getSafeUtxos(provider2), target);
    const funding = selected.map((u) => ({ utxo: u }));
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: buildPreviewScript(publisherPub, { collectionRef: collectionId, mimeType, previewBytes: clip.bytes }).toBinary()
    });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout: 1,
      satPerKb: DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[1]?.value ?? 0) > 0 ? { outputIndex: 1, satoshis: tx.outputs[1].value ?? 0 } : void 0
    );
    return txId;
  }
  async function resolvePreview(provider2, publisherPubKeyHex, collectionId) {
    const address2 = addressFromPubHex(publisherPubKeyHex);
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory(address2)) heightByTx.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const txId of await provider2.getRecentTxIdsForAddress(address2)) {
        if (!heightByTx.has(txId)) heightByTx.set(txId, 0);
      }
    } catch {
    }
    if (heightByTx.size === 0) return null;
    const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_HISTORY_SCAN2).map(([txId]) => txId);
    const pub = publisherPubKeyHex.toLowerCase();
    const want = collectionId.toLowerCase();
    for (const txId of ordered) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const p = parsePreviewScript(LockingScript.fromBinary(o.script));
        if (p && p.publisherPubKeyHex.toLowerCase() === pub && p.fields.collectionRef.toLowerCase() === want) {
          return { mimeType: p.fields.mimeType, bytes: p.fields.previewBytes, txId };
        }
      }
    }
    return null;
  }

  // src/broadcast.ts
  var MAX_BROADCAST_BYTES = 480;
  var MAX_BROADCAST_SCAN = 50;
  async function publishBroadcast(provider2, key2, collectionId, text, senderAlias) {
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("announcement is empty");
    if (new TextEncoder().encode(trimmed).length > MAX_BROADCAST_BYTES) {
      throw new Error(`announcement exceeds ${MAX_BROADCAST_BYTES} bytes`);
    }
    const pubHex = toHex(key2.publicKey());
    const envelope = await buildEnvelope({
      senderPriv: key2,
      recipientPubKeyHex: pubHex,
      parts: [{ kind: "text", text: trimmed }],
      encrypt: false,
      senderAlias,
      sentAt: Date.now()
    });
    const selected = selectFunding(await getSafeUtxos(provider2), PHARLAP_OUTPUT_SATS + 600);
    const funding = await Promise.all(
      selected.map((u) => ({ utxo: u }))
    );
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: buildMessageScript(pubHex, { ref: collectionId, envelope }).toBinary()
    });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout: 1,
      satPerKb: DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[1]?.value ?? 0) > 0 ? { outputIndex: 1, satoshis: tx.outputs[1].value ?? 0 } : void 0
    );
    return txId;
  }
  async function resolveBroadcasts(provider2, publisherPubKeyHex, collectionId) {
    const address2 = addressFromPubHex(publisherPubKeyHex);
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory(address2)) heightByTx.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const txId of await provider2.getRecentTxIdsForAddress(address2)) {
        if (!heightByTx.has(txId)) heightByTx.set(txId, 0);
      }
    } catch {
    }
    if (heightByTx.size === 0) return [];
    const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_BROADCAST_SCAN);
    const publisher = publisherPubKeyHex.toLowerCase();
    const want = collectionId.toLowerCase();
    const out = [];
    for (const [txId, height] of ordered) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const m = parseMessageScript(LockingScript.fromBinary(o.script));
        if (m == null) continue;
        if (m.recipientPubKeyHex.toLowerCase() !== publisher) continue;
        if (m.fields.ref.toLowerCase() !== want) continue;
        const opened = await openPublicEnvelope(m.fields.envelope);
        if (opened == null || opened.senderPubKeyHex.toLowerCase() !== publisher) continue;
        const textPart = opened.parts.find((p) => p.kind === "text");
        if (textPart && textPart.kind === "text") out.push({ text: textPart.text, txId, height, senderAlias: opened.senderAlias });
      }
    }
    return out;
  }

  // src/qrcodegen.ts
  var qrcodegen;
  ((qrcodegen2) => {
    const _QrCode = class _QrCode {
      /*-- Constructor (low level) and fields --*/
      // Creates a new QR Code with the given version number,
      // error correction level, data codeword bytes, and mask number.
      // This is a low-level API that most users should not use directly.
      // A mid-level API is the encodeSegments() function.
      constructor(version, errorCorrectionLevel, dataCodewords, msk) {
        this.version = version;
        this.errorCorrectionLevel = errorCorrectionLevel;
        // The modules of this QR Code (false = light, true = dark).
        // Immutable after constructor finishes. Accessed through getModule().
        this.modules = [];
        // Indicates function modules that are not subjected to masking. Discarded when constructor finishes.
        this.isFunction = [];
        if (version < _QrCode.MIN_VERSION || version > _QrCode.MAX_VERSION)
          throw new RangeError("Version value out of range");
        if (msk < -1 || msk > 7)
          throw new RangeError("Mask value out of range");
        this.size = version * 4 + 17;
        let row = [];
        for (let i = 0; i < this.size; i++)
          row.push(false);
        for (let i = 0; i < this.size; i++) {
          this.modules.push(row.slice());
          this.isFunction.push(row.slice());
        }
        this.drawFunctionPatterns();
        const allCodewords = this.addEccAndInterleave(dataCodewords);
        this.drawCodewords(allCodewords);
        if (msk == -1) {
          let minPenalty = 1e9;
          for (let i = 0; i < 8; i++) {
            this.applyMask(i);
            this.drawFormatBits(i);
            const penalty = this.getPenaltyScore();
            if (penalty < minPenalty) {
              msk = i;
              minPenalty = penalty;
            }
            this.applyMask(i);
          }
        }
        assert(0 <= msk && msk <= 7);
        this.mask = msk;
        this.applyMask(msk);
        this.drawFormatBits(msk);
        this.isFunction = [];
      }
      /*-- Static factory functions (high level) --*/
      // Returns a QR Code representing the given Unicode text string at the given error correction level.
      // As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
      // Unicode code points (not UTF-16 code units) if the low error correction level is used. The smallest possible
      // QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
      // ecl argument if it can be done without increasing the version.
      static encodeText(text, ecl) {
        const segs = qrcodegen2.QrSegment.makeSegments(text);
        return _QrCode.encodeSegments(segs, ecl);
      }
      // Returns a QR Code representing the given binary data at the given error correction level.
      // This function always encodes using the binary segment mode, not any text mode. The maximum number of
      // bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
      // The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.
      static encodeBinary(data, ecl) {
        const seg = qrcodegen2.QrSegment.makeBytes(data);
        return _QrCode.encodeSegments([seg], ecl);
      }
      /*-- Static factory functions (mid level) --*/
      // Returns a QR Code representing the given segments with the given encoding parameters.
      // The smallest possible QR Code version within the given range is automatically
      // chosen for the output. Iff boostEcl is true, then the ECC level of the result
      // may be higher than the ecl argument if it can be done without increasing the
      // version. The mask number is either between 0 to 7 (inclusive) to force that
      // mask, or -1 to automatically choose an appropriate mask (which may be slow).
      // This function allows the user to create a custom sequence of segments that switches
      // between modes (such as alphanumeric and byte) to encode text in less space.
      // This is a mid-level API; the high-level API is encodeText() and encodeBinary().
      static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
        if (!(_QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= _QrCode.MAX_VERSION) || mask < -1 || mask > 7)
          throw new RangeError("Invalid value");
        let version;
        let dataUsedBits;
        for (version = minVersion; ; version++) {
          const dataCapacityBits2 = _QrCode.getNumDataCodewords(version, ecl) * 8;
          const usedBits = QrSegment.getTotalBits(segs, version);
          if (usedBits <= dataCapacityBits2) {
            dataUsedBits = usedBits;
            break;
          }
          if (version >= maxVersion)
            throw new RangeError("Data too long");
        }
        for (const newEcl of [_QrCode.Ecc.MEDIUM, _QrCode.Ecc.QUARTILE, _QrCode.Ecc.HIGH]) {
          if (boostEcl && dataUsedBits <= _QrCode.getNumDataCodewords(version, newEcl) * 8)
            ecl = newEcl;
        }
        let bb = [];
        for (const seg of segs) {
          appendBits(seg.mode.modeBits, 4, bb);
          appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
          for (const b of seg.getData())
            bb.push(b);
        }
        assert(bb.length == dataUsedBits);
        const dataCapacityBits = _QrCode.getNumDataCodewords(version, ecl) * 8;
        assert(bb.length <= dataCapacityBits);
        appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
        appendBits(0, (8 - bb.length % 8) % 8, bb);
        assert(bb.length % 8 == 0);
        for (let padByte = 236; bb.length < dataCapacityBits; padByte ^= 236 ^ 17)
          appendBits(padByte, 8, bb);
        let dataCodewords = [];
        while (dataCodewords.length * 8 < bb.length)
          dataCodewords.push(0);
        bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << 7 - (i & 7));
        return new _QrCode(version, ecl, dataCodewords, mask);
      }
      /*-- Accessor methods --*/
      // Returns the color of the module (pixel) at the given coordinates, which is false
      // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
      // If the given coordinates are out of bounds, then false (light) is returned.
      getModule(x, y) {
        return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
      }
      /*-- Private helper methods for constructor: Drawing function modules --*/
      // Reads this object's version field, and draws and marks all function modules.
      drawFunctionPatterns() {
        for (let i = 0; i < this.size; i++) {
          this.setFunctionModule(6, i, i % 2 == 0);
          this.setFunctionModule(i, 6, i % 2 == 0);
        }
        this.drawFinderPattern(3, 3);
        this.drawFinderPattern(this.size - 4, 3);
        this.drawFinderPattern(3, this.size - 4);
        const alignPatPos = this.getAlignmentPatternPositions();
        const numAlign = alignPatPos.length;
        for (let i = 0; i < numAlign; i++) {
          for (let j = 0; j < numAlign; j++) {
            if (!(i == 0 && j == 0 || i == 0 && j == numAlign - 1 || i == numAlign - 1 && j == 0))
              this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
          }
        }
        this.drawFormatBits(0);
        this.drawVersion();
      }
      // Draws two copies of the format bits (with its own error correction code)
      // based on the given mask and this object's error correction level field.
      drawFormatBits(mask) {
        const data = this.errorCorrectionLevel.formatBits << 3 | mask;
        let rem = data;
        for (let i = 0; i < 10; i++)
          rem = rem << 1 ^ (rem >>> 9) * 1335;
        const bits2 = (data << 10 | rem) ^ 21522;
        assert(bits2 >>> 15 == 0);
        for (let i = 0; i <= 5; i++)
          this.setFunctionModule(8, i, getBit(bits2, i));
        this.setFunctionModule(8, 7, getBit(bits2, 6));
        this.setFunctionModule(8, 8, getBit(bits2, 7));
        this.setFunctionModule(7, 8, getBit(bits2, 8));
        for (let i = 9; i < 15; i++)
          this.setFunctionModule(14 - i, 8, getBit(bits2, i));
        for (let i = 0; i < 8; i++)
          this.setFunctionModule(this.size - 1 - i, 8, getBit(bits2, i));
        for (let i = 8; i < 15; i++)
          this.setFunctionModule(8, this.size - 15 + i, getBit(bits2, i));
        this.setFunctionModule(8, this.size - 8, true);
      }
      // Draws two copies of the version bits (with its own error correction code),
      // based on this object's version field, iff 7 <= version <= 40.
      drawVersion() {
        if (this.version < 7)
          return;
        let rem = this.version;
        for (let i = 0; i < 12; i++)
          rem = rem << 1 ^ (rem >>> 11) * 7973;
        const bits2 = this.version << 12 | rem;
        assert(bits2 >>> 18 == 0);
        for (let i = 0; i < 18; i++) {
          const color = getBit(bits2, i);
          const a = this.size - 11 + i % 3;
          const b = Math.floor(i / 3);
          this.setFunctionModule(a, b, color);
          this.setFunctionModule(b, a, color);
        }
      }
      // Draws a 9*9 finder pattern including the border separator,
      // with the center module at (x, y). Modules can be out of bounds.
      drawFinderPattern(x, y) {
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const xx = x + dx;
            const yy = y + dy;
            if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
              this.setFunctionModule(xx, yy, dist != 2 && dist != 4);
          }
        }
      }
      // Draws a 5*5 alignment pattern, with the center module
      // at (x, y). All modules must be in bounds.
      drawAlignmentPattern(x, y) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++)
            this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
        }
      }
      // Sets the color of a module and marks it as a function module.
      // Only used by the constructor. Coordinates must be in bounds.
      setFunctionModule(x, y, isDark) {
        this.modules[y][x] = isDark;
        this.isFunction[y][x] = true;
      }
      /*-- Private helper methods for constructor: Codewords and masking --*/
      // Returns a new byte string representing the given data with the appropriate error correction
      // codewords appended to it, based on this object's version and error correction level.
      addEccAndInterleave(data) {
        const ver = this.version;
        const ecl = this.errorCorrectionLevel;
        if (data.length != _QrCode.getNumDataCodewords(ver, ecl))
          throw new RangeError("Invalid argument");
        const numBlocks = _QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
        const blockEccLen = _QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
        const rawCodewords = Math.floor(_QrCode.getNumRawDataModules(ver) / 8);
        const numShortBlocks = numBlocks - rawCodewords % numBlocks;
        const shortBlockLen = Math.floor(rawCodewords / numBlocks);
        let blocks = [];
        const rsDiv = _QrCode.reedSolomonComputeDivisor(blockEccLen);
        for (let i = 0, k = 0; i < numBlocks; i++) {
          let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
          k += dat.length;
          const ecc = _QrCode.reedSolomonComputeRemainder(dat, rsDiv);
          if (i < numShortBlocks)
            dat.push(0);
          blocks.push(dat.concat(ecc));
        }
        let result = [];
        for (let i = 0; i < blocks[0].length; i++) {
          blocks.forEach((block, j) => {
            if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)
              result.push(block[i]);
          });
        }
        assert(result.length == rawCodewords);
        return result;
      }
      // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
      // data area of this QR Code. Function modules need to be marked off before this is called.
      drawCodewords(data) {
        if (data.length != Math.floor(_QrCode.getNumRawDataModules(this.version) / 8))
          throw new RangeError("Invalid argument");
        let i = 0;
        for (let right = this.size - 1; right >= 1; right -= 2) {
          if (right == 6)
            right = 5;
          for (let vert = 0; vert < this.size; vert++) {
            for (let j = 0; j < 2; j++) {
              const x = right - j;
              const upward = (right + 1 & 2) == 0;
              const y = upward ? this.size - 1 - vert : vert;
              if (!this.isFunction[y][x] && i < data.length * 8) {
                this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
                i++;
              }
            }
          }
        }
        assert(i == data.length * 8);
      }
      // XORs the codeword modules in this QR Code with the given mask pattern.
      // The function modules must be marked and the codeword bits must be drawn
      // before masking. Due to the arithmetic of XOR, calling applyMask() with
      // the same mask value a second time will undo the mask. A final well-formed
      // QR Code needs exactly one (not zero, two, etc.) mask applied.
      applyMask(mask) {
        if (mask < 0 || mask > 7)
          throw new RangeError("Mask value out of range");
        for (let y = 0; y < this.size; y++) {
          for (let x = 0; x < this.size; x++) {
            let invert;
            switch (mask) {
              case 0:
                invert = (x + y) % 2 == 0;
                break;
              case 1:
                invert = y % 2 == 0;
                break;
              case 2:
                invert = x % 3 == 0;
                break;
              case 3:
                invert = (x + y) % 3 == 0;
                break;
              case 4:
                invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;
                break;
              case 5:
                invert = x * y % 2 + x * y % 3 == 0;
                break;
              case 6:
                invert = (x * y % 2 + x * y % 3) % 2 == 0;
                break;
              case 7:
                invert = ((x + y) % 2 + x * y % 3) % 2 == 0;
                break;
              default:
                throw new Error("Unreachable");
            }
            if (!this.isFunction[y][x] && invert)
              this.modules[y][x] = !this.modules[y][x];
          }
        }
      }
      // Calculates and returns the penalty score based on state of this QR Code's current modules.
      // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
      getPenaltyScore() {
        let result = 0;
        for (let y = 0; y < this.size; y++) {
          let runColor = false;
          let runX = 0;
          let runHistory = [0, 0, 0, 0, 0, 0, 0];
          for (let x = 0; x < this.size; x++) {
            if (this.modules[y][x] == runColor) {
              runX++;
              if (runX == 5)
                result += _QrCode.PENALTY_N1;
              else if (runX > 5)
                result++;
            } else {
              this.finderPenaltyAddHistory(runX, runHistory);
              if (!runColor)
                result += this.finderPenaltyCountPatterns(runHistory) * _QrCode.PENALTY_N3;
              runColor = this.modules[y][x];
              runX = 1;
            }
          }
          result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * _QrCode.PENALTY_N3;
        }
        for (let x = 0; x < this.size; x++) {
          let runColor = false;
          let runY = 0;
          let runHistory = [0, 0, 0, 0, 0, 0, 0];
          for (let y = 0; y < this.size; y++) {
            if (this.modules[y][x] == runColor) {
              runY++;
              if (runY == 5)
                result += _QrCode.PENALTY_N1;
              else if (runY > 5)
                result++;
            } else {
              this.finderPenaltyAddHistory(runY, runHistory);
              if (!runColor)
                result += this.finderPenaltyCountPatterns(runHistory) * _QrCode.PENALTY_N3;
              runColor = this.modules[y][x];
              runY = 1;
            }
          }
          result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * _QrCode.PENALTY_N3;
        }
        for (let y = 0; y < this.size - 1; y++) {
          for (let x = 0; x < this.size - 1; x++) {
            const color = this.modules[y][x];
            if (color == this.modules[y][x + 1] && color == this.modules[y + 1][x] && color == this.modules[y + 1][x + 1])
              result += _QrCode.PENALTY_N2;
          }
        }
        let dark = 0;
        for (const row of this.modules)
          dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
        const total = this.size * this.size;
        const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        assert(0 <= k && k <= 9);
        result += k * _QrCode.PENALTY_N4;
        assert(0 <= result && result <= 2568888);
        return result;
      }
      /*-- Private helper functions --*/
      // Returns an ascending list of positions of alignment patterns for this version number.
      // Each position is in the range [0,177), and are used on both the x and y axes.
      // This could be implemented as lookup table of 40 variable-length lists of integers.
      getAlignmentPatternPositions() {
        if (this.version == 1)
          return [];
        else {
          const numAlign = Math.floor(this.version / 7) + 2;
          const step = Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
          let result = [6];
          for (let pos = this.size - 7; result.length < numAlign; pos -= step)
            result.splice(1, 0, pos);
          return result;
        }
      }
      // Returns the number of data bits that can be stored in a QR Code of the given version number, after
      // all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
      // The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.
      static getNumRawDataModules(ver) {
        if (ver < _QrCode.MIN_VERSION || ver > _QrCode.MAX_VERSION)
          throw new RangeError("Version number out of range");
        let result = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
          const numAlign = Math.floor(ver / 7) + 2;
          result -= (25 * numAlign - 10) * numAlign - 55;
          if (ver >= 7)
            result -= 36;
        }
        assert(208 <= result && result <= 29648);
        return result;
      }
      // Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
      // QR Code of the given version number and error correction level, with remainder bits discarded.
      // This stateless pure function could be implemented as a (40*4)-cell lookup table.
      static getNumDataCodewords(ver, ecl) {
        return Math.floor(_QrCode.getNumRawDataModules(ver) / 8) - _QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * _QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
      }
      // Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
      // implemented as a lookup table over all possible parameter values, instead of as an algorithm.
      static reedSolomonComputeDivisor(degree) {
        if (degree < 1 || degree > 255)
          throw new RangeError("Degree out of range");
        let result = [];
        for (let i = 0; i < degree - 1; i++)
          result.push(0);
        result.push(1);
        let root = 1;
        for (let i = 0; i < degree; i++) {
          for (let j = 0; j < result.length; j++) {
            result[j] = _QrCode.reedSolomonMultiply(result[j], root);
            if (j + 1 < result.length)
              result[j] ^= result[j + 1];
          }
          root = _QrCode.reedSolomonMultiply(root, 2);
        }
        return result;
      }
      // Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
      static reedSolomonComputeRemainder(data, divisor) {
        let result = divisor.map((_) => 0);
        for (const b of data) {
          const factor = b ^ result.shift();
          result.push(0);
          divisor.forEach((coef, i) => result[i] ^= _QrCode.reedSolomonMultiply(coef, factor));
        }
        return result;
      }
      // Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
      // are unsigned 8-bit integers. This could be implemented as a lookup table of 256*256 entries of uint8.
      static reedSolomonMultiply(x, y) {
        if (x >>> 8 != 0 || y >>> 8 != 0)
          throw new RangeError("Byte out of range");
        let z = 0;
        for (let i = 7; i >= 0; i--) {
          z = z << 1 ^ (z >>> 7) * 285;
          z ^= (y >>> i & 1) * x;
        }
        assert(z >>> 8 == 0);
        return z;
      }
      // Can only be called immediately after a light run is added, and
      // returns either 0, 1, or 2. A helper function for getPenaltyScore().
      finderPenaltyCountPatterns(runHistory) {
        const n = runHistory[1];
        assert(n <= this.size * 3);
        const core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;
        return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
      }
      // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
      finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
        if (currentRunColor) {
          this.finderPenaltyAddHistory(currentRunLength, runHistory);
          currentRunLength = 0;
        }
        currentRunLength += this.size;
        this.finderPenaltyAddHistory(currentRunLength, runHistory);
        return this.finderPenaltyCountPatterns(runHistory);
      }
      // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
      finderPenaltyAddHistory(currentRunLength, runHistory) {
        if (runHistory[0] == 0)
          currentRunLength += this.size;
        runHistory.pop();
        runHistory.unshift(currentRunLength);
      }
    };
    /*-- Constants and tables --*/
    // The minimum version number supported in the QR Code Model 2 standard.
    _QrCode.MIN_VERSION = 1;
    // The maximum version number supported in the QR Code Model 2 standard.
    _QrCode.MAX_VERSION = 40;
    // For use in getPenaltyScore(), when evaluating which mask is best.
    _QrCode.PENALTY_N1 = 3;
    _QrCode.PENALTY_N2 = 3;
    _QrCode.PENALTY_N3 = 40;
    _QrCode.PENALTY_N4 = 10;
    _QrCode.ECC_CODEWORDS_PER_BLOCK = [
      // Version: (note that index 0 is for padding, and is set to an illegal value)
      //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
      [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      // Low
      [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
      // Medium
      [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      // Quartile
      [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
      // High
    ];
    _QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
      // Version: (note that index 0 is for padding, and is set to an illegal value)
      //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
      [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
      // Low
      [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
      // Medium
      [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
      // Quartile
      [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
      // High
    ];
    let QrCode2 = _QrCode;
    qrcodegen2.QrCode = _QrCode;
    function appendBits(val2, len, bb) {
      if (len < 0 || len > 31 || val2 >>> len != 0)
        throw new RangeError("Value out of range");
      for (let i = len - 1; i >= 0; i--)
        bb.push(val2 >>> i & 1);
    }
    function getBit(x, i) {
      return (x >>> i & 1) != 0;
    }
    function assert(cond) {
      if (!cond)
        throw new Error("Assertion error");
    }
    const _QrSegment = class _QrSegment {
      /*-- Constructor (low level) and fields --*/
      // Creates a new QR Code segment with the given attributes and data.
      // The character count (numChars) must agree with the mode and the bit buffer length,
      // but the constraint isn't checked. The given bit buffer is cloned and stored.
      constructor(mode, numChars, bitData) {
        this.mode = mode;
        this.numChars = numChars;
        this.bitData = bitData;
        if (numChars < 0)
          throw new RangeError("Invalid argument");
        this.bitData = bitData.slice();
      }
      /*-- Static factory functions (mid level) --*/
      // Returns a segment representing the given binary data encoded in
      // byte mode. All input byte arrays are acceptable. Any text string
      // can be converted to UTF-8 bytes and encoded as a byte mode segment.
      static makeBytes(data) {
        let bb = [];
        for (const b of data)
          appendBits(b, 8, bb);
        return new _QrSegment(_QrSegment.Mode.BYTE, data.length, bb);
      }
      // Returns a segment representing the given string of decimal digits encoded in numeric mode.
      static makeNumeric(digits) {
        if (!_QrSegment.isNumeric(digits))
          throw new RangeError("String contains non-numeric characters");
        let bb = [];
        for (let i = 0; i < digits.length; ) {
          const n = Math.min(digits.length - i, 3);
          appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
          i += n;
        }
        return new _QrSegment(_QrSegment.Mode.NUMERIC, digits.length, bb);
      }
      // Returns a segment representing the given text string encoded in alphanumeric mode.
      // The characters allowed are: 0 to 9, A to Z (uppercase only), space,
      // dollar, percent, asterisk, plus, hyphen, period, slash, colon.
      static makeAlphanumeric(text) {
        if (!_QrSegment.isAlphanumeric(text))
          throw new RangeError("String contains unencodable characters in alphanumeric mode");
        let bb = [];
        let i;
        for (i = 0; i + 2 <= text.length; i += 2) {
          let temp = _QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
          temp += _QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
          appendBits(temp, 11, bb);
        }
        if (i < text.length)
          appendBits(_QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
        return new _QrSegment(_QrSegment.Mode.ALPHANUMERIC, text.length, bb);
      }
      // Returns a new mutable list of zero or more segments to represent the given Unicode text string.
      // The result may use various segment modes and switch modes to optimize the length of the bit stream.
      static makeSegments(text) {
        if (text == "")
          return [];
        else if (_QrSegment.isNumeric(text))
          return [_QrSegment.makeNumeric(text)];
        else if (_QrSegment.isAlphanumeric(text))
          return [_QrSegment.makeAlphanumeric(text)];
        else
          return [_QrSegment.makeBytes(_QrSegment.toUtf8ByteArray(text))];
      }
      // Returns a segment representing an Extended Channel Interpretation
      // (ECI) designator with the given assignment value.
      static makeEci(assignVal) {
        let bb = [];
        if (assignVal < 0)
          throw new RangeError("ECI assignment value out of range");
        else if (assignVal < 1 << 7)
          appendBits(assignVal, 8, bb);
        else if (assignVal < 1 << 14) {
          appendBits(2, 2, bb);
          appendBits(assignVal, 14, bb);
        } else if (assignVal < 1e6) {
          appendBits(6, 3, bb);
          appendBits(assignVal, 21, bb);
        } else
          throw new RangeError("ECI assignment value out of range");
        return new _QrSegment(_QrSegment.Mode.ECI, 0, bb);
      }
      // Tests whether the given string can be encoded as a segment in numeric mode.
      // A string is encodable iff each character is in the range 0 to 9.
      static isNumeric(text) {
        return _QrSegment.NUMERIC_REGEX.test(text);
      }
      // Tests whether the given string can be encoded as a segment in alphanumeric mode.
      // A string is encodable iff each character is in the following set: 0 to 9, A to Z
      // (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
      static isAlphanumeric(text) {
        return _QrSegment.ALPHANUMERIC_REGEX.test(text);
      }
      /*-- Methods --*/
      // Returns a new copy of the data bits of this segment.
      getData() {
        return this.bitData.slice();
      }
      // (Package-private) Calculates and returns the number of bits needed to encode the given segments at
      // the given version. The result is infinity if a segment has too many characters to fit its length field.
      static getTotalBits(segs, version) {
        let result = 0;
        for (const seg of segs) {
          const ccbits = seg.mode.numCharCountBits(version);
          if (seg.numChars >= 1 << ccbits)
            return Infinity;
          result += 4 + ccbits + seg.bitData.length;
        }
        return result;
      }
      // Returns a new array of bytes representing the given string encoded in UTF-8.
      static toUtf8ByteArray(str) {
        str = encodeURI(str);
        let result = [];
        for (let i = 0; i < str.length; i++) {
          if (str.charAt(i) != "%")
            result.push(str.charCodeAt(i));
          else {
            result.push(parseInt(str.substring(i + 1, i + 3), 16));
            i += 2;
          }
        }
        return result;
      }
    };
    /*-- Constants --*/
    // Describes precisely all strings that are encodable in numeric mode.
    _QrSegment.NUMERIC_REGEX = /^[0-9]*$/;
    // Describes precisely all strings that are encodable in alphanumeric mode.
    _QrSegment.ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;
    // The set of all legal characters in alphanumeric mode,
    // where each character value maps to the index in the string.
    _QrSegment.ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    let QrSegment = _QrSegment;
    qrcodegen2.QrSegment = _QrSegment;
  })(qrcodegen || (qrcodegen = {}));
  ((qrcodegen2) => {
    let QrCode2;
    ((QrCode3) => {
      const _Ecc = class _Ecc {
        // The QR Code can tolerate about 30% erroneous codewords
        /*-- Constructor and fields --*/
        constructor(ordinal, formatBits) {
          this.ordinal = ordinal;
          this.formatBits = formatBits;
        }
      };
      /*-- Constants --*/
      _Ecc.LOW = new _Ecc(0, 1);
      // The QR Code can tolerate about  7% erroneous codewords
      _Ecc.MEDIUM = new _Ecc(1, 0);
      // The QR Code can tolerate about 15% erroneous codewords
      _Ecc.QUARTILE = new _Ecc(2, 3);
      // The QR Code can tolerate about 25% erroneous codewords
      _Ecc.HIGH = new _Ecc(3, 2);
      let Ecc = _Ecc;
      QrCode3.Ecc = _Ecc;
    })(QrCode2 = qrcodegen2.QrCode || (qrcodegen2.QrCode = {}));
  })(qrcodegen || (qrcodegen = {}));
  ((qrcodegen2) => {
    let QrSegment;
    ((QrSegment2) => {
      const _Mode = class _Mode {
        /*-- Constructor and fields --*/
        constructor(modeBits, numBitsCharCount) {
          this.modeBits = modeBits;
          this.numBitsCharCount = numBitsCharCount;
        }
        /*-- Method --*/
        // (Package-private) Returns the bit width of the character count field for a segment in
        // this mode in a QR Code at the given version number. The result is in the range [0, 16].
        numCharCountBits(ver) {
          return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
        }
      };
      /*-- Constants --*/
      _Mode.NUMERIC = new _Mode(1, [10, 12, 14]);
      _Mode.ALPHANUMERIC = new _Mode(2, [9, 11, 13]);
      _Mode.BYTE = new _Mode(4, [8, 16, 16]);
      _Mode.KANJI = new _Mode(8, [8, 10, 12]);
      _Mode.ECI = new _Mode(7, [0, 0, 0]);
      let Mode = _Mode;
      QrSegment2.Mode = _Mode;
    })(QrSegment = qrcodegen2.QrSegment || (qrcodegen2.QrSegment = {}));
  })(qrcodegen || (qrcodegen = {}));

  // src/qr.ts
  var QrCode = qrcodegen.QrCode;
  function bsvPaymentUri(address2, amountSats) {
    if (amountSats == null || amountSats <= 0) return address2;
    const bsv = (amountSats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return `bitcoin:${address2}?amount=${bsv}`;
  }
  function qrSvg(text, opts) {
    const border = opts?.border ?? 3;
    const dark = opts?.dark ?? "#000000";
    const light = opts?.light ?? "#ffffff";
    const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
    const dim = qr.size + border * 2;
    let path = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) path += `${path ? " " : ""}M${x + border},${y + border}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
  }

  // src/verify.ts
  var parentIdOf = (input) => input?.txid === void 0 ? void 0 : wireToTxid(input.txid);
  var lockOf = (o) => o === void 0 ? void 0 : LockingScript.fromBinary(o.script);
  async function verifyTokenLineage(tokenTx, outputIndex, deps) {
    const tokenOut = tokenTx.outputs[outputIndex];
    const token = tokenOut ? parseTokenScript(lockOf(tokenOut)) : null;
    if (token == null) return { valid: false, reason: "output is not a PHAR LAP token" };
    const collectionId = token.fields.tx1Ref;
    let tx1;
    try {
      tx1 = await deps.getRawTransaction(collectionId);
    } catch {
      return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}\u2026`, collectionId };
    }
    if (tx1.txid() !== collectionId) {
      return { valid: false, reason: "fetched TX1 does not hash to the collection id \u2014 tampered collection anchor", collectionId };
    }
    const hasTemplate = tx1.outputs.some((o) => parseTemplateScript(lockOf(o)) != null);
    if (!hasTemplate) {
      return { valid: false, reason: "TX1 has no TEMPLATE output \u2014 invalid collection anchor", collectionId };
    }
    const input0 = tokenTx.inputs[0];
    const parentTxId = parentIdOf(input0);
    const parentVout = input0?.vout;
    if (parentTxId == null || parentVout == null) {
      return { valid: false, reason: "token tx has no input 0", collectionId };
    }
    let isGenesis;
    try {
      const parentTx = await deps.getRawTransaction(parentTxId);
      const parentOut = parentTx.outputs[parentVout];
      const parentToken = parentOut ? parseTokenScript(lockOf(parentOut)) : null;
      isGenesis = !(parentToken != null && parentToken.fields.tx1Ref === collectionId);
    } catch {
      return { valid: false, reason: "cannot fetch immediate parent tx", collectionId };
    }
    if (deps.getProof != null && deps.chainTracker != null) {
      const proofTxId = isGenesis ? tokenTx.txid() : parentTxId;
      const proof = await deps.getProof(proofTxId);
      if (proof != null) {
        const ok = await proof.verify(proofTxId, deps.chainTracker);
        if (!ok) {
          return { valid: false, reason: "Merkle proof did not verify against the chain", collectionId, isGenesis };
        }
        return {
          valid: true,
          reason: isGenesis ? "valid genesis token (confirmed)" : "valid descendant token (parent confirmed)",
          collectionId,
          isGenesis
        };
      }
      return {
        valid: true,
        reason: isGenesis ? "valid genesis token (unconfirmed)" : "valid descendant token (unconfirmed)",
        collectionId,
        isGenesis,
        unconfirmed: true
      };
    }
    return {
      valid: true,
      reason: isGenesis ? "valid genesis token (structure only)" : "valid descendant token (structure only)",
      collectionId,
      isGenesis,
      unconfirmed: true
    };
  }
  var bytesEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  async function verifyEditionCovenant(tokenTx, outputIndex, deps) {
    const lock2 = lockOf(tokenTx.outputs[outputIndex]);
    const ed = lock2 != null ? parseEditionScript(lock2) : null;
    if (ed == null) return { valid: false, reason: "output is not a PHAR LAP edition covenant" };
    const collectionId = ed.tx1RefHex;
    let tx1;
    try {
      tx1 = await deps.getRawTransaction(collectionId);
    } catch {
      return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}\u2026`, collectionId };
    }
    let covenantHex = "", tokenName = "";
    for (const o of tx1.outputs) {
      const t = parseTemplateScript(lockOf(o));
      if (t != null) {
        covenantHex = t.fields.covenantScript;
        tokenName = t.fields.tokenName;
        break;
      }
    }
    if (covenantHex === "") {
      return { valid: false, reason: "TX1 has no covenant template \u2014 not a valid edition collection", collectionId };
    }
    let expected;
    try {
      expected = buildHolderEditionScript(hexBytes(covenantHex), hexBytes(collectionId), hexBytes(ed.ownerPubKeyHex));
    } catch {
      return { valid: false, reason: "collection template is malformed", collectionId, collectionName: tokenName };
    }
    const actual = lock2.toBinary();
    if (!bytesEqual(expected, actual)) {
      return { valid: false, reason: "covenant does NOT match this collection\u2019s committed rules \u2014 possible counterfeit or altered fees", collectionId, collectionName: tokenName };
    }
    const in0 = tokenTx.inputs[0];
    const parentTxId = parentIdOf(in0);
    const isGenesis = parentTxId === collectionId;
    return {
      valid: true,
      reason: isGenesis ? "genuine genesis edition (covenant matches the collection\u2019s committed rules)" : "genuine edition (covenant matches the collection\u2019s committed rules)",
      collectionId,
      collectionName: tokenName,
      isGenesis,
      publisherFeeSats: ed.terms.publisherFeeSats,
      holderFeeSats: ed.terms.holderFeeSats
    };
  }

  // src/thumbs.ts
  var PREFIX = "p:thumb:";
  var MAX_EDGE = 256;
  var NONE = "-";
  var SVG_FIX = "p:thumbfix1";
  try {
    if (localStorage.getItem(SVG_FIX) == null) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k != null && k.startsWith(PREFIX) && localStorage.getItem(k) === NONE) localStorage.removeItem(k);
      }
      localStorage.setItem(SVG_FIX, "1");
    }
  } catch {
  }
  function cachedThumb(collectionId) {
    try {
      const v = localStorage.getItem(PREFIX + collectionId);
      return v != null && v !== NONE ? v : null;
    } catch {
      return null;
    }
  }
  function thumbResolved(collectionId) {
    try {
      return localStorage.getItem(PREFIX + collectionId) != null;
    } catch {
      return false;
    }
  }
  function store(collectionId, value) {
    try {
      localStorage.setItem(PREFIX + collectionId, value);
    } catch {
    }
  }
  function cacheNoThumb(collectionId) {
    store(collectionId, NONE);
  }
  var MIME_PREFIX = "p:mime:";
  var NO_FILE = "\0";
  function cachedMime(collectionId) {
    try {
      const v = localStorage.getItem(MIME_PREFIX + collectionId);
      return v == null ? void 0 : v === NO_FILE ? null : v;
    } catch {
      return void 0;
    }
  }
  function cacheMime(collectionId, mimeType) {
    try {
      localStorage.setItem(MIME_PREFIX + collectionId, mimeType == null || mimeType === "" ? NO_FILE : mimeType);
    } catch {
    }
  }
  async function decodeImage(bytes, mimeType) {
    const type = mimeType || "application/octet-stream";
    const blob = new Blob([new Uint8Array(bytes)], { type });
    if (/^image\/svg\+xml\b/i.test(type)) return decodeSvg(blob);
    const bmp = await createImageBitmap(blob);
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close?.() };
  }
  function decodeSvg(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const revoke = () => URL.revokeObjectURL(url);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 1 || h < 1) {
          revoke();
          resolve(null);
          return;
        }
        resolve({ src: img, w, h, done: revoke });
      };
      img.onerror = () => {
        revoke();
        resolve(null);
      };
      img.src = url;
    });
  }
  async function downscaleToAvatar(bytes, mimeType, maxEdge = 96) {
    if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
    try {
      const img = await decodeImage(bytes, mimeType);
      if (img == null) return null;
      const scale = Math.min(1, maxEdge / Math.max(img.w, img.h));
      const w = Math.max(1, Math.round(img.w * scale));
      const h = Math.max(1, Math.round(img.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx == null) {
        img.done();
        return null;
      }
      ctx.drawImage(img.src, 0, 0, w, h);
      img.done();
      const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.7));
      if (out == null) return null;
      return { mimeType: "image/webp", bytes: Array.from(new Uint8Array(await out.arrayBuffer())) };
    } catch {
      return null;
    }
  }
  async function makeThumb(collectionId, bytes, mimeType) {
    if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
    try {
      const img = await decodeImage(bytes, mimeType);
      if (img == null) return null;
      const scale = Math.min(1, MAX_EDGE / Math.max(img.w, img.h));
      const w = Math.max(1, Math.round(img.w * scale));
      const h = Math.max(1, Math.round(img.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx == null) {
        img.done();
        return null;
      }
      ctx.drawImage(img.src, 0, 0, w, h);
      img.done();
      const url = canvas.toDataURL("image/webp", 0.8);
      store(collectionId, url);
      return url;
    } catch {
      return null;
    }
  }

  // src/profile.ts
  var MAX_PROFILE_SCAN = 30;
  async function publishProfile(provider2, key2, profile) {
    const pubHex = toHex(key2.publicKey());
    const fields = {
      alias: profile.alias,
      avatarMimeType: profile.avatar?.mimeType,
      avatarBytes: profile.avatar?.bytes
    };
    const avatarLen = profile.avatar?.bytes.length ?? 0;
    const estFee = Math.ceil((350 + avatarLen) * DEFAULT_FEE_PER_KB / 1e3);
    const selected = selectFunding(await getSafeUtxos(provider2), PHARLAP_OUTPUT_SATS + estFee + 600);
    const funding = selected.map((u) => ({ utxo: u }));
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildProfileScript(pubHex, fields).toBinary() });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout: 1,
      satPerKb: DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[1]?.value ?? 0) > 0 ? { outputIndex: 1, satoshis: tx.outputs[1].value ?? 0 } : void 0
    );
    return txId;
  }
  async function resolveProfile(provider2, ownerPubKeyHex) {
    const address2 = addressFromPubHex(ownerPubKeyHex);
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory(address2)) heightByTx.set(h.txId, h.blockHeight || 0);
    } catch {
      return null;
    }
    try {
      for (const txId of await provider2.getRecentTxIdsForAddress(address2)) if (!heightByTx.has(txId)) heightByTx.set(txId, 0);
    } catch {
    }
    if (heightByTx.size === 0) return null;
    const owner = ownerPubKeyHex.toLowerCase();
    const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_PROFILE_SCAN);
    for (const [txId] of ordered) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const p = parseProfileScript(LockingScript.fromBinary(o.script));
        if (p != null && p.ownerPubKeyHex.toLowerCase() === owner) return p.fields;
      }
    }
    return null;
  }

  // src/discussion.ts
  var MAX_WALK_HOPS = 600;
  var MAX_FEED_POSTS = 200;
  var MAX_POST_BYTES = 1e3;
  function u32le2(n) {
    return [n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255];
  }
  function nodeSeed(tag, collectionId, birthTxId, birthVout) {
    return [...utf8Bytes(tag), ...hexBytes(collectionId), ...hexBytes(birthTxId), ...u32le2(birthVout)];
  }
  function nodeFeedHash160(collectionId, birthTxId, birthVout) {
    return hash160Bytes(nodeSeed("PHARLAP-DISC-NODE-v1", collectionId, birthTxId, birthVout));
  }
  function rootFeedHash160(collectionId) {
    return hash160Bytes([...utf8Bytes("PHARLAP-DISC-ROOT-v1"), ...hexBytes(collectionId)]);
  }
  function downFeedHash160(collectionId, birthTxId, birthVout) {
    return hash160Bytes(nodeSeed("PHARLAP-DISC-DOWN-v1", collectionId, birthTxId, birthVout));
  }
  function rootDownFeedHash160(collectionId) {
    return hash160Bytes([...utf8Bytes("PHARLAP-DISC-DOWNROOT-v1"), ...hexBytes(collectionId)]);
  }
  function nodeRef(collectionId, birthTxId, birthVout) {
    return hexOf(sha256Bytes(nodeSeed("PHARLAP-DISC-NODE-v1", collectionId, birthTxId, birthVout)));
  }
  function editionAt(tx, vout) {
    const out = tx.outputs[vout];
    return out == null ? null : parseEditionScript(LockingScript.fromBinary(out.script));
  }
  async function walkNodeAncestors(provider2, startTxId, startVout, collectionId, maxHops = MAX_WALK_HOPS) {
    const nodes = [];
    let txId = startTxId, vout = startVout;
    for (let hop = 0; hop < maxHops; hop++) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        break;
      }
      const ed = editionAt(tx, vout);
      if (ed == null || ed.tx1RefHex !== collectionId) break;
      const in0 = tx.inputs[0];
      const pTxId = in0 == null ? void 0 : wireToTxid(in0.txid);
      const pVout = in0?.vout;
      let parentSameCollection = false;
      if (pTxId != null && pVout != null) {
        try {
          const pTx = await provider2.getSourceTransaction(pTxId);
          const pEd = editionAt(pTx, pVout);
          parentSameCollection = pEd != null && pEd.tx1RefHex === collectionId;
        } catch {
        }
      }
      if (!parentSameCollection) {
        nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: true });
        break;
      }
      if (vout === 1) {
        nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: false });
      }
      txId = pTxId;
      vout = pVout;
    }
    return nodes;
  }
  async function postToNodeFeed(provider2, key2, params) {
    const trimmed = params.text.trim();
    if (trimmed.length === 0) throw new Error("post is empty");
    if (new TextEncoder().encode(trimmed).length > MAX_POST_BYTES) throw new Error(`post exceeds ${MAX_POST_BYTES} bytes`);
    const downs = params.downBreadcrumbs ?? [];
    const pubHex = toHex(key2.publicKey());
    const envelope = await buildEnvelope({
      senderPriv: key2,
      recipientPubKeyHex: pubHex,
      parts: [{ kind: "text", text: trimmed }],
      encrypt: false,
      senderAlias: params.senderAlias,
      sentAt: Date.now()
    });
    const selected = selectFunding(await getSafeUtxos(provider2), PHARLAP_OUTPUT_SATS + 1 + downs.length + 700);
    const funding = selected.map((u) => ({ utxo: u }));
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildMessageScript(pubHex, { ref: params.ref, envelope }).toBinary() });
    tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript2(params.feedHash160)) });
    for (const h of downs) tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript2(h)) });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    const changeVout = tx.outputs.length - 1;
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout,
      satPerKb: params.feePerKb ?? DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      (tx.outputs[changeVout]?.value ?? 0) > 0 ? { outputIndex: changeVout, satoshis: tx.outputs[changeVout].value ?? 0 } : void 0
    );
    return txId;
  }
  async function scanNodeFeed(provider2, feedHash160, wantRef) {
    const sh = wocScriptHash(p2pkhScript2(feedHash160));
    let utxos = [];
    try {
      utxos = await provider2.getUnspentByScriptHash(sh);
    } catch {
      return [];
    }
    const want = wantRef?.toLowerCase();
    const seenTx = /* @__PURE__ */ new Set();
    const posts = [];
    for (const u of utxos) {
      if (seenTx.has(u.txId)) continue;
      seenTx.add(u.txId);
      if (seenTx.size > MAX_FEED_POSTS) break;
      let tx;
      try {
        tx = await provider2.getSourceTransaction(u.txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const m = parseMessageScript(LockingScript.fromBinary(o.script));
        if (m == null) continue;
        if (want != null && m.fields.ref.toLowerCase() !== want) continue;
        const opened = await openPublicEnvelope(m.fields.envelope);
        if (opened == null || opened.senderPubKeyHex.toLowerCase() !== m.recipientPubKeyHex.toLowerCase()) continue;
        const textPart = opened.parts.find((p) => p.kind === "text");
        if (textPart && textPart.kind === "text") {
          posts.push({ text: textPart.text, authorPubKeyHex: opened.senderPubKeyHex, senderAlias: opened.senderAlias, sentAt: opened.sentAt, txId: u.txId, ref: m.fields.ref });
        }
      }
    }
    return posts;
  }
  async function resolveCorridor(provider2, startTxId, startVout, collectionId) {
    const ancestors = await walkNodeAncestors(provider2, startTxId, startVout, collectionId);
    const out = [{
      birthTxId: collectionId,
      birthVout: -1,
      ownerPubKeyHex: "",
      isGenesis: false,
      feedHash160: rootFeedHash160(collectionId),
      downHash160: rootDownFeedHash160(collectionId),
      ref: collectionId,
      isRoot: true,
      isSelf: false
    }];
    ancestors.forEach((n, i) => out.push({
      ...n,
      feedHash160: nodeFeedHash160(collectionId, n.birthTxId, n.birthVout),
      downHash160: downFeedHash160(collectionId, n.birthTxId, n.birthVout),
      ref: nodeRef(collectionId, n.birthTxId, n.birthVout),
      isRoot: false,
      isSelf: i === ancestors.length - 1
    }));
    return out;
  }
  async function readCorridor(provider2, startTxId, startVout, collectionId, opts = {}) {
    const nodes = await resolveCorridor(provider2, startTxId, startVout, collectionId);
    const byTx = /* @__PURE__ */ new Map();
    const add3 = (p, node) => {
      if (!byTx.has(p.txId)) byTx.set(p.txId, { ...p, node });
    };
    for (const node of nodes) for (const p of await scanNodeFeed(provider2, node.feedHash160, node.ref)) add3(p, node);
    const selfNode = nodes.find((n) => n.isSelf);
    const downChannels = [];
    if (selfNode) downChannels.push({ h: selfNode.downHash160, tag: { ...selfNode, isSelf: false, isDownstream: true } });
    if (opts.rootDownstream) {
      const root = nodes[0];
      downChannels.push({ h: root.downHash160, tag: { ...root, isRoot: false, isDownstream: true } });
    }
    for (const ch of downChannels) for (const p of await scanNodeFeed(provider2, ch.h)) add3(p, ch.tag);
    const posts = [...byTx.values()].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
    return { nodes, posts };
  }

  // src/configBackup.ts
  var MAX_CONFIG_SCAN = 30;
  var CONFIG_SCHEMA = 1;
  async function publishConfigBackup(provider2, key2, cfg, savedAt) {
    const pubHex = toHex(key2.publicKey());
    const blob = { schema: CONFIG_SCHEMA, alias: cfg.alias, aliasAt: cfg.aliasAt, contacts: cfg.contacts, contactsAt: cfg.contactsAt, prefs: cfg.prefs, savedAt };
    const envelope = await buildEnvelope({
      senderPriv: key2,
      recipientPubKeyHex: pubHex,
      parts: [{ kind: "text", text: JSON.stringify(blob) }],
      encrypt: true
    });
    const estFee = Math.ceil((350 + envelope.length) * DEFAULT_FEE_PER_KB / 1e3);
    const selected = selectFunding(await getSafeUtxos(provider2), PHARLAP_OUTPUT_SATS + estFee + 600);
    const funding = selected.map((u) => ({ utxo: u }));
    const tx = new Tx(1, [], [], 0);
    addFunding(tx, funding);
    tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildConfigScript(pubHex, { envelope }).toBinary() });
    tx.outputs.push({ value: 0, script: key2.lockingScript() });
    applyFee(tx, {
      inputValues: funding.map((f) => f.utxo.satoshis),
      unlockingSizes: funding.map(() => UNLOCK_P2PKH),
      changeVout: 1,
      satPerKb: DEFAULT_FEE_PER_KB
    });
    signFunding(tx, key2, funding);
    await provider2.broadcast(tx.hex());
    const txId = tx.txid();
    const changeSats = tx.outputs[1]?.value ?? 0;
    provider2.registerPendingTx(
      txId,
      selected.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex })),
      changeSats > 0 ? { outputIndex: 1, satoshis: changeSats } : void 0
    );
    return txId;
  }
  async function resolveConfigBackup(provider2, key2) {
    const pubHex = toHex(key2.publicKey());
    const address2 = p2pkhAddress(key2.publicKey());
    const heightByTx = /* @__PURE__ */ new Map();
    try {
      for (const h of await provider2.getAddressHistory(address2)) heightByTx.set(h.txId, h.blockHeight || 0);
    } catch {
    }
    try {
      for (const txId of await provider2.getRecentTxIdsForAddress(address2)) if (!heightByTx.has(txId)) heightByTx.set(txId, 0);
    } catch {
    }
    if (heightByTx.size === 0) return null;
    const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_CONFIG_SCAN);
    const mine = pubHex.toLowerCase();
    for (const [txId] of ordered) {
      let tx;
      try {
        tx = await provider2.getSourceTransaction(txId);
      } catch {
        continue;
      }
      for (const o of tx.outputs) {
        const c = parseConfigScript(LockingScript.fromBinary(o.script));
        if (c == null || c.ownerPubKeyHex.toLowerCase() !== mine) continue;
        const opened = await openEnvelope(c.fields.envelope, key2);
        if (opened == null || opened.senderPubKeyHex.toLowerCase() !== mine) continue;
        const textPart = opened.parts.find((p) => p.kind === "text");
        if (textPart == null || textPart.kind !== "text") continue;
        try {
          const blob = JSON.parse(textPart.text);
          if (blob != null && typeof blob === "object" && blob.contacts != null) return blob;
        } catch {
        }
      }
    }
    return null;
  }
  function mergeConfig(local, backup) {
    const contacts2 = { ...local.contacts };
    const contactsAt2 = { ...local.contactsAt };
    let changed = 0;
    for (const [pk, name] of Object.entries(backup.contacts)) {
      const bAt = backup.contactsAt?.[pk] ?? backup.savedAt ?? 0;
      const lAt = contactsAt2[pk] ?? (contacts2[pk] != null ? 0 : -1);
      if (lAt < 0 || bAt > lAt) {
        if (contacts2[pk] !== name || contactsAt2[pk] !== bAt) changed++;
        contacts2[pk] = name;
        contactsAt2[pk] = bAt;
      }
    }
    let alias = local.alias, aliasAt = local.aliasAt;
    if (backup.alias != null && (backup.aliasAt ?? backup.savedAt ?? 0) > (local.aliasAt ?? -1)) {
      alias = backup.alias;
      aliasAt = backup.aliasAt ?? backup.savedAt;
    }
    return { alias, aliasAt, contacts: contacts2, contactsAt: contactsAt2, changed };
  }

  // src/app.ts
  var APP_BASE = location.pathname.replace(/[^/]*$/, "");
  var WIF_KEY = "p2:wallet:wif";
  var WATCH_KEY = "p2:wallet:watch";
  var key;
  var pubKeyHex;
  var address;
  var provider;
  var store2;
  var nftView = "list";
  var nftSort = "recent";
  var lastInbox = [];
  var lastUpdatesFeed = null;
  var $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el;
  };
  var val = (id) => $(id).value.trim();
  var short = (s, n = 10) => s.length > 2 * n ? `${s.slice(0, n)}\u2026${s.slice(-n)}` : s;
  var kb = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  var fmtTime = (ms) => {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return "";
    }
  };
  var fmtUtc = (ms) => {
    try {
      return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
    } catch {
      return "";
    }
  };
  function setStatus(msg, kind = "info") {
    const el = $("status");
    el.textContent = msg;
    el.className = `status ${kind}`;
  }
  function setStatusHtml(html, kind = "info") {
    const el = $("status");
    el.innerHTML = html;
    el.className = `status ${kind}`;
  }
  function idChip(full) {
    return `<span class="copyid" data-full="${escapeHtml(full)}" title="Click to copy the full id">${escapeHtml(short(full))}</span>`;
  }
  document.addEventListener("click", (e) => {
    const chip = e.target?.closest?.(".copyid");
    if (chip?.dataset.full) {
      void navigator.clipboard?.writeText(chip.dataset.full);
      toast("Copied \u2713");
    }
  });
  var MNEMONIC_KEY = "p2:wallet:mnemonic";
  var BACKED_UP_KEY = "p2:wallet:backedUp";
  var DERIVATION_PATH = "m/44'/236'/0'/0/0";
  function keyFromMnemonic(phrase, passphrase = "") {
    const m = phrase.trim().replace(/\s+/g, " ");
    if (!isValid(m)) throw new Error("invalid seed phrase");
    return Signer.fromSeed(toSeed(m, passphrase), DERIVATION_PATH);
  }
  function newSeedWallet() {
    const mnemonic = fromEntropy(crypto.getRandomValues(new Uint8Array(16)));
    return { mnemonic, key: keyFromMnemonic(mnemonic) };
  }
  function loadKey() {
    const wif = localStorage.getItem(WIF_KEY);
    if (wif) {
      try {
        return Signer.fromWif(wif);
      } catch {
      }
    }
    const { mnemonic, key: key2 } = newSeedWallet();
    localStorage.setItem(WIF_KEY, key2.toWif());
    localStorage.setItem(MNEMONIC_KEY, mnemonic);
    return key2;
  }
  function markBackedUp() {
    localStorage.setItem(BACKED_UP_KEY, "1");
  }
  function needsSeedBackup() {
    return !!localStorage.getItem(MNEMONIC_KEY) && !localStorage.getItem(BACKED_UP_KEY);
  }
  function useKey(k) {
    localStorage.removeItem(WATCH_KEY);
    key = k;
    pubKeyHex = toHex(k.publicKey());
    address = k.address();
    provider = new WalletProvider(address);
    salesCache = null;
    renderWallet();
  }
  function useWatchKey(watchPubKeyHex) {
    const pub = compressedPubKeyHex(watchPubKeyHex);
    key = null;
    pubKeyHex = pub;
    address = addressFromPubHex(pub);
    provider = new WalletProvider(address);
    salesCache = null;
    renderWallet();
  }
  function isWatchOnly() {
    return key == null;
  }
  function requireKey() {
    if (key == null) {
      setStatus("This is a watch-only wallet \u2014 it holds no private key. Export the request here, sign it on your offline machine, then broadcast the signed result.", "error");
      return null;
    }
    return key;
  }
  function switchToWatch(watchPubKeyHex) {
    const pub = compressedPubKeyHex(watchPubKeyHex);
    localStorage.setItem(WATCH_KEY, pub);
    localStorage.removeItem(WIF_KEY);
    localStorage.removeItem(MNEMONIC_KEY);
    store2.clear();
    useWatchKey(pub);
    renderTokens();
    void refreshBalance();
    setStatus("Watch-only wallet loaded \u2014 recovering holdings from chain\u2026");
    void onCheckIncoming();
  }
  function switchWallet(k, recover, mnemonic) {
    localStorage.setItem(WIF_KEY, k.toWif());
    if (mnemonic != null && mnemonic !== "") localStorage.setItem(MNEMONIC_KEY, mnemonic);
    else localStorage.removeItem(MNEMONIC_KEY);
    store2.clear();
    useKey(k);
    renderTokens();
    void refreshBalance();
    if (recover) {
      setStatus("Wallet restored \u2014 recovering your purchases from chain\u2026");
      void onCheckIncoming();
      void restoreConfigFromChain(true).then((n) => {
        if (n > 0) {
          renderContacts();
          refreshNameSurfaces();
          updateCfgBackupNote();
          toast(`Restored ${n} contact${n > 1 ? "s" : ""} from your backup`);
        }
      }).catch(() => {
      });
    }
  }
  function renderWallet() {
    $("address").textContent = address;
    $("pubkey").textContent = pubKeyHex;
    const mine = document.getElementById("myIdenticon");
    if (mine) mine.innerHTML = avatarHtml(pubKeyHex, 22);
    document.body.classList.toggle("watch-only", key == null);
    const watchEl = document.getElementById("watchBanner");
    if (watchEl != null) watchEl.hidden = key != null;
    $("wif").value = key != null ? key.toWif() : "";
    const seedEl = document.getElementById("seedPhrase");
    if (seedEl != null) seedEl.value = key != null ? localStorage.getItem(MNEMONIC_KEY) ?? "" : "";
    hideWif();
    hideSeed();
  }
  function hideWif() {
    ;
    $("wif").type = "password";
    $("btnWifShow").textContent = "\u{1F441} Show";
  }
  function hideSeed() {
    const el = document.getElementById("seedPhrase");
    const btn = document.getElementById("btnSeedShow");
    if (el != null) el.classList.add("blurred");
    if (btn != null) btn.textContent = "\u{1F441} Reveal";
  }
  function toggleSeed() {
    const el = document.getElementById("seedPhrase");
    const btn = document.getElementById("btnSeedShow");
    if (el == null || btn == null) return;
    const blurred = el.classList.toggle("blurred");
    btn.textContent = blurred ? "\u{1F441} Reveal" : "\u{1F648} Hide";
  }
  function showSeedModal(mnemonic, opts = {}) {
    const words2 = mnemonic.split(" ");
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const closeBtn = opts.gated ? "" : '<button class="secondary seed-close">\u2715 Close</button>';
    const intro = opts.intro ? `<p style="font-size:13px;margin:0 0 8px;color:#eab300;font-weight:600">${escapeHtml(opts.intro)}</p>` : "";
    const doneLabel = opts.gated ? "\u2705 I\u2019ve written down my seed phrase \u2014 claim my NFT gift" : "I\u2019ve written it down";
    overlay.innerHTML = `<div class="modal-box" style="max-width:460px"><div class="modal-head"><span>\u{1F511} Your new seed phrase</span>${closeBtn}</div>` + intro + `<p class="muted" style="font-size:13px;margin:0 0 10px">Write these 12 words down, in order, and keep them secret &amp; safe. <b>Anyone with them controls this wallet</b>, and if you lose them with no backup it <b>cannot be recovered</b>.</p><div class="seed-grid">${words2.map((w, i) => `<div class="seed-word"><span class="seed-num">${i + 1}</span> ${escapeHtml(w)}</div>`).join("")}</div><div class="row" style="margin-top:12px"><button class="seed-copy">Copy phrase</button><button class="secondary seed-done">${doneLabel}</button></div></div>`;
    const close = () => overlay.remove();
    overlay.querySelector(".seed-close")?.addEventListener("click", close);
    overlay.querySelector(".seed-done")?.addEventListener("click", () => {
      markBackedUp();
      close();
      opts.onDone?.();
    });
    overlay.querySelector(".seed-copy")?.addEventListener("click", () => void navigator.clipboard?.writeText(mnemonic));
    document.body.append(overlay);
  }
  var SIMPLESWAP_BASE = "https://simpleswap.io/";
  var DEFAULT_REF_CODE = "efe9f9694b4f";
  var incomingAff = null;
  function extractRefCode(input) {
    const s = input.trim();
    if (s === "") return null;
    const m = s.match(/[?&](?:ref|referral)=([^&\s]+)/i);
    if (m) return decodeURIComponent(m[1]);
    if (/^[A-Za-z0-9_-]{3,}$/.test(s)) return s;
    return null;
  }
  function myRefCode() {
    try {
      return localStorage.getItem("p2:affRefCode");
    } catch {
      return null;
    }
  }
  function refByCode() {
    try {
      return localStorage.getItem("p2:refBy");
    } catch {
      return null;
    }
  }
  function rememberGifter() {
    if (incomingAff == null || incomingAff === "") return;
    try {
      if (localStorage.getItem("p2:refBy") == null) localStorage.setItem("p2:refBy", incomingAff);
    } catch {
    }
  }
  function buyBsvUrl() {
    const code = incomingAff || myRefCode() || refByCode() || DEFAULT_REF_CODE;
    const ref = code ? "ref=" + encodeURIComponent(code) + "&" : "";
    return SIMPLESWAP_BASE + "?" + ref + "from=btc-btc&to=bsv-bsv&amount=0.001";
  }
  function onBuyBsv() {
    window.open(buyBsvUrl(), "_blank", "noopener,noreferrer");
  }
  function withAff(url) {
    const code = myRefCode();
    return code != null && code !== "" ? `${url}&aff=${encodeURIComponent(code)}` : url;
  }
  function collectionShareUrl(txid, holder, giftWif) {
    const params = new URLSearchParams({ h: holder });
    if (giftWif) params.set("g", giftWif);
    return withAff(`${location.origin}${APP_BASE}c/${txid}#${params.toString()}`);
  }
  async function shortShareBase(txid, holder) {
    try {
      const r = await fetch(`${APP_BASE}shorten.php`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txid, holder, aff: myRefCode() ?? void 0 })
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data != null && typeof data.code === "string" && data.code) return `${location.origin}${APP_BASE}s/${data.code}`;
    } catch {
    }
    return null;
  }
  function coverToJpegDataUrl(cover) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(cover.bytes)], { type: cover.mimeType }));
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d");
          if (ctx == null) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/jpeg", 0.85));
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }
  var ogRegistered = /* @__PURE__ */ new Set();
  async function registerOgAssets(info) {
    if (ogRegistered.has(info.tx1Ref)) return;
    ogRegistered.add(info.tx1Ref);
    try {
      const cover = info.cover ? await coverToJpegDataUrl(info.cover) : null;
      await fetch(`${APP_BASE}register.php`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txid: info.tx1Ref, title: info.name, description: info.description, cover: cover ?? void 0 })
      });
    } catch {
      ogRegistered.delete(info.tx1Ref);
    }
  }
  function renderAffField() {
    const el = document.getElementById("affRefCode");
    if (el != null) el.value = myRefCode() ?? "";
  }
  function onSaveAff() {
    const raw = val("affRefCode");
    if (raw === "") {
      try {
        localStorage.removeItem("p2:affRefCode");
      } catch {
      }
      setStatus("Referral code cleared \u2014 your shared links use the app default.", "ok");
      return;
    }
    const code = extractRefCode(raw);
    if (code == null) {
      setStatus("That doesn\u2019t look like a SimpleSwap link or ref-code.", "error");
      return;
    }
    try {
      localStorage.setItem("p2:affRefCode", code);
    } catch {
    }
    ;
    $("affRefCode").value = code;
    setStatus("Saved \u2014 your shared sales pages now carry your Buy-BSV referral.", "ok");
  }
  var jsqrFn = null;
  async function loadJsqr() {
    if (jsqrFn != null) return jsqrFn;
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "./jsqr.min.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("load failed"));
        document.head.append(s);
      });
      const g = window.jsQRlib;
      jsqrFn = g?.default ?? g ?? null;
    } catch {
      jsqrFn = null;
    }
    return jsqrFn;
  }
  async function scanQrModal(title) {
    if (navigator.mediaDevices?.getUserMedia == null) {
      setStatus("This browser can\u2019t access a camera (needs HTTPS + camera support).", "error");
      return null;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      setStatus("Camera unavailable \u2014 allow camera access (and use HTTPS) to scan.", "error");
      return null;
    }
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `<div class="modal-box" style="max-width:380px"><div class="modal-head"><span>${escapeHtml(title)}</span><button class="secondary scan-close">\u2715 Close</button></div><video class="qr-scan-video" playsinline muted></video><p class="muted" style="font-size:12px;margin:8px 0 0">Point the camera at a QR code.</p></div>`;
    document.body.append(overlay);
    const video = overlay.querySelector("video");
    video.srcObject = stream;
    await video.play().catch(() => {
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = window.BarcodeDetector;
    const detector = Detector != null ? new Detector({ formats: ["qr_code"] }) : null;
    let decode2 = null;
    if (detector == null) {
      decode2 = await loadJsqr();
      if (decode2 == null) {
        stream.getTracks().forEach((t) => t.stop());
        overlay.remove();
        setStatus("Couldn\u2019t load the QR scanner \u2014 check your connection and retry.", "error");
        return null;
      }
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (val2) => {
        if (done) return;
        done = true;
        stream.getTracks().forEach((t) => t.stop());
        overlay.remove();
        resolve(val2);
      };
      overlay.querySelector(".scan-close")?.addEventListener("click", () => finish(null));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(null);
      });
      const tick = async () => {
        if (done) return;
        if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            if (detector != null) {
              const codes = await detector.detect(canvas);
              if (codes.length > 0 && codes[0].rawValue) {
                finish(codes[0].rawValue);
                return;
              }
            } else {
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const r = decode2(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (r?.data) {
                finish(r.data);
                return;
              }
            }
          } catch {
          }
        }
        requestAnimationFrame(() => void tick());
      };
      requestAnimationFrame(() => void tick());
    });
  }
  function normalizeScan(kind, text) {
    let s = text.trim();
    if (kind === "addr") s = s.replace(/^(bitcoin|bitcoinsv|bsv):/i, "").split("?")[0].trim();
    else if (kind === "pubkey") {
      const m = s.match(/[?&#]h=([0-9a-fA-F]{66,130})/);
      if (m) s = m[1];
    }
    return s;
  }
  async function onScanInto(input, kind) {
    const text = await scanQrModal("\u{1F4F7} Scan QR code");
    if (text == null) return;
    input.value = normalizeScan(kind, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setStatus("Scanned \u2713", "ok");
  }
  function wireScanButtons() {
    document.querySelectorAll("input[data-scan]").forEach((input) => {
      if (input.dataset.scanWired === "1") return;
      input.dataset.scanWired = "1";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary scan-btn";
      btn.textContent = "\u{1F4F7}";
      btn.title = "Scan a QR code";
      const wrap = document.createElement("div");
      wrap.className = "scan-row";
      input.parentNode?.insertBefore(wrap, input);
      wrap.append(input, btn);
      btn.onclick = () => void onScanInto(input, input.dataset.scan);
    });
  }
  async function refreshBalance() {
    setStatus("Fetching balance\u2026");
    try {
      const safe = await getSafeUtxos(provider);
      const spendable = safe.reduce((s, u) => s + u.satoshis, 0);
      $("balance").textContent = `${spendable} sats spendable (${safe.length} funding UTXO${safe.length === 1 ? "" : "s"})`;
      setStatus("Balance updated.", "ok");
    } catch (e) {
      setStatus(`Balance error: ${e.message}`, "error");
    }
  }
  async function readFile(input) {
    const f = input.files?.[0];
    if (!f) return void 0;
    const buf = new Uint8Array(await f.arrayBuffer());
    return { mimeType: f.type || "application/octet-stream", fileName: f.name, bytes: Array.from(buf) };
  }
  async function readContent(input, albumName) {
    const fs = input.files;
    if (!fs || fs.length === 0) return void 0;
    if (fs.length === 1) return readFile(input);
    if (fs.length > MAX_ALBUM_TRACKS) throw new Error(`Select at most ${MAX_ALBUM_TRACKS} tracks for one release (got ${fs.length}).`);
    const ordered = Array.from(fs).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
    const tracks = [];
    for (const f of ordered) tracks.push({ name: f.name, mimeType: f.type || "application/octet-stream", bytes: Array.from(new Uint8Array(await f.arrayBuffer())) });
    const safe = (albumName || "album").replace(/[^\w.-]+/g, "_");
    return { mimeType: ALBUM_MIME, fileName: `${safe}.plep`, bytes: packAlbum(tracks) };
  }
  function confirmAudioFidelity(file) {
    const isLossless = (mime, name) => /wav|aiff|x-aiff|flac|x-flac|x-pn-wav/.test(mime.toLowerCase()) || /\.(wav|aif|aiff|flac|alac)$/i.test(name);
    let lossless = false;
    if (file.mimeType === ALBUM_MIME) {
      for (const t of parseAlbum(file.bytes) ?? []) if (isLossless(t.mimeType, t.name)) {
        lossless = true;
        break;
      }
    } else {
      lossless = isLossless(file.mimeType, file.fileName);
    }
    const big = file.bytes.length > 8 * 1024 * 1024;
    if (!lossless && !big) return true;
    const advice = lossless ? "Compressing to MP3/Opus first can cut the cost dramatically \u2014 but if you want maximum fidelity, keeping it lossless is totally fine." : "Compressing it first can cut the cost \u2014 but if you need the full file, that\u2019s fine.";
    return confirm(
      `Heads up \u2014 you\u2019re embedding ${lossless ? "uncompressed / lossless audio" : "a large file"} (${kb(file.bytes.length)}).

It\u2019s stored permanently on-chain, so the mint fee scales with its size. ${advice}

Mint as-is?`
    );
  }
  async function onMint() {
    const k = requireKey();
    if (k == null) return;
    const name = val("mintName");
    const count = Math.max(1, parseInt(val("mintCount") || "1", 10));
    if (!name) {
      setStatus("Enter a collection name.", "error");
      return;
    }
    setStatus("Preparing the mint transaction\u2026");
    try {
      const file = await readContent($("mintFile"), name);
      if (file != null && !confirmAudioFidelity(file)) {
        setStatus("Mint cancelled \u2014 compress the file first, or proceed as-is when you\u2019re ready.");
        return;
      }
      const result = await createCollection(provider, k, {
        tokenName: name,
        supply: count,
        mintCount: count,
        file,
        confirmSpend: (total) => confirm(
          `Mint ${count} NFT${count > 1 ? "s" : ""} in \u201C${name}\u201D${file ? ` (embedding a ${kb(file.bytes.length)} file)` : ""}?

This spends ${total.toLocaleString()} sats from your wallet (network fee + ${count} \xD7 1-sat token output${count > 1 ? "s" : ""}).

Proceed?`
        )
      });
      for (const op3 of result.tokenOutpoints) {
        store2.add({ txId: op3.txId, outputIndex: op3.outputIndex, collectionId: result.collectionId, stateData: "", collectionName: name });
      }
      renderTokens();
      setStatusHtml(`Minted ${result.tokenOutpoints.length} NFT(s). Collection ${idChip(result.collectionId)} (TX1 ${idChip(result.tx1Id)}, TX2 ${idChip(result.tx2Id)}).`, "ok");
    } catch (e) {
      if (e.message === SPEND_CANCELLED) {
        setStatus("Mint cancelled \u2014 nothing was spent.");
        return;
      }
      setStatus(`Mint failed: ${e.message}`, "error");
    }
  }
  var EDITION_BOND_SATS = 1;
  function fmtPrice(sats) {
    const s = Math.round(Number(sats) || 0);
    return s >= 1e6 ? (s / 1e8).toFixed(3).replace(/\.?0+$/, "") + " BSV" : s.toLocaleString() + " sats";
  }
  function chosenBond() {
    return Math.max(1, parseInt(val("edBond") || String(EDITION_BOND_SATS), 10));
  }
  var feeMode = "fixed";
  function computeFees() {
    if (feeMode === "pct") {
      const bond = chosenBond();
      const fees = Math.max(2, (parseInt(val("edPrice") || "0", 10) || 0) - bond);
      const resellerPct = Math.min(100, Math.max(0, parseInt(val("edResellerPct") || "0", 10) || 0));
      const holderFeeSats = Math.min(fees - 1, Math.max(1, Math.round(fees * resellerPct / 100)));
      return { publisherFeeSats: Math.max(1, fees - holderFeeSats), holderFeeSats };
    }
    return {
      publisherFeeSats: Math.max(1, parseInt(val("edPublisherFee") || "1", 10)),
      holderFeeSats: Math.max(1, parseInt(val("edHolderFee") || "1", 10))
    };
  }
  function ownTerms() {
    return {
      publisherPubKeyHash: hash160Bytes(hexBytes(pubKeyHex)),
      ...computeFees(),
      tokenSats: chosenBond()
    };
  }
  function setFeeMode(mode) {
    feeMode = mode;
    $("btnFeeFixed").classList.toggle("active", mode === "fixed");
    $("btnFeePct").classList.toggle("active", mode === "pct");
    $("feeFixed").hidden = mode !== "fixed";
    $("feePct").hidden = mode !== "pct";
    updateFeePctPreview();
  }
  function updateFeePctPreview() {
    if (feeMode !== "pct") return;
    const bond = chosenBond();
    const enteredPrice = parseInt(val("edPrice") || "0", 10) || 0;
    const el = $("edPctPreview");
    if (enteredPrice < bond + 2) {
      el.innerHTML = `<span style="color:#ffb4ae">Final price must be at least ${(bond + 2).toLocaleString()} sat (above the ${bond.toLocaleString()}-sat bond).</span>`;
      return;
    }
    const f = computeFees();
    const buyerTotal = f.publisherFeeSats + f.holderFeeSats + bond;
    el.innerHTML = `\u2192 Reseller <b>${f.holderFeeSats.toLocaleString()}</b> \xB7 Publisher <b>${f.publisherFeeSats.toLocaleString()}</b> \xB7 bond <b>${bond.toLocaleString()}</b> (refundable)<br>Buyer pays <b>${buyerTotal.toLocaleString()} sat</b> per copy <span class="muted">(+ a small network fee; the ${bond.toLocaleString()}-sat bond is reclaimable by burning)</span>`;
  }
  function termsFromToken(t) {
    return {
      publisherPubKeyHash: hexBytes(t.publisherPubKeyHashHex ?? ""),
      publisherFeeSats: t.publisherFeeSats ?? 0,
      holderFeeSats: t.holderFeeSats ?? 0,
      tokenSats: t.tokenSats ?? 1
    };
  }
  function storeEdition(o, collectionId, name, terms, note) {
    store2.add({
      txId: o.txId,
      outputIndex: o.outputIndex,
      collectionId,
      stateData: "",
      collectionName: name,
      kind: "edition",
      lockHex: o.lockHex,
      publisherPubKeyHashHex: hexOf(terms.publisherPubKeyHash),
      publisherFeeSats: terms.publisherFeeSats,
      holderFeeSats: terms.holderFeeSats,
      ...terms.tokenSats != null ? { tokenSats: terms.tokenSats } : {},
      ...note?.text ? { sellerNote: note.text } : {},
      ...note?.bonusValue ? { bonusKind: note.bonusKind, bonusValue: note.bonusValue } : {}
    });
  }
  var COVER_OUT = 800;
  var croppedCover = null;
  var coverPrevUrl = null;
  function paintCoverPreview(blob) {
    const host = $("edCoverPreview");
    if (!host) return;
    if (coverPrevUrl) {
      URL.revokeObjectURL(coverPrevUrl);
      coverPrevUrl = null;
    }
    if (!blob) {
      host.innerHTML = "";
      return;
    }
    coverPrevUrl = URL.createObjectURL(blob);
    host.innerHTML = `<img src="${coverPrevUrl}" alt="cover" /><span class="muted" style="font-size:12px">Cover \u2014 ${kb(blob.size)}</span>`;
  }
  async function isAnimatedImage(f) {
    if (f.type === "image/gif" || /\.gif$/i.test(f.name)) return true;
    if (f.type === "image/webp" || /\.webp$/i.test(f.name)) {
      try {
        const s = String.fromCharCode(...new Uint8Array(await f.slice(0, 4096).arrayBuffer()));
        return s.includes("ANIM") || s.includes("ANMF");
      } catch {
        return false;
      }
    }
    return false;
  }
  function isSvgImage(f) {
    return f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  }
  async function cropAndStoreCover(f) {
    const svg = isSvgImage(f);
    if (svg || await isAnimatedImage(f)) {
      const msg = svg ? `"${f.name}" is a scalable, self-animating SVG (${kb(f.size)}). Use it as the cover as-is?

OK \u2014 keep the SVG (it rides on-chain, stays razor-sharp at any size, and the listing animates).
Cancel \u2014 pick a different image (an SVG can't go through the square crop without losing its animation).` : `"${f.name}" is animated (${kb(f.size)}). Keep it animated as the cover?

OK \u2014 keep the animation as-is (it rides on-chain, so a larger animated cover costs a little more to mint).
Cancel \u2014 crop it to a small, static 800\xD7800 cover instead.`;
      if (confirm(msg)) {
        const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
        croppedCover = { mimeType: (svg ? "image/svg+xml" : f.type) || "image/webp", fileName: f.name || (svg ? "cover.svg" : "cover.webp"), bytes };
        paintCoverPreview(new Blob([new Uint8Array(bytes)], { type: croppedCover.mimeType }));
        return true;
      }
      if (svg) return false;
    }
    const blob = await openCropModal(f);
    if (!blob) return false;
    croppedCover = { mimeType: blob.type || "image/webp", fileName: "cover.webp", bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    paintCoverPreview(blob);
    return true;
  }
  async function onCoverSelected() {
    const input = $("edCover");
    const f = input.files?.[0];
    if (!f) {
      croppedCover = null;
      paintCoverPreview(null);
      return;
    }
    if (!await cropAndStoreCover(f)) input.value = "";
  }
  async function onTakePhoto() {
    const photo = await capturePhotoModal();
    if (!photo) return;
    $("edCover").value = "";
    await cropAndStoreCover(photo);
  }
  async function capturePhotoModal() {
    if (navigator.mediaDevices?.getUserMedia == null) {
      setStatus("This browser can\u2019t access a camera (needs HTTPS + camera support).", "error");
      return null;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      setStatus("Camera unavailable \u2014 allow camera access (and use HTTPS) to take a photo.", "error");
      return null;
    }
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = '<div class="modal-box" style="max-width:380px"><div class="modal-head"><span>\u{1F4F7} Take a cover photo</span><button class="secondary cam-close">\u2715 Cancel</button></div><video class="qr-scan-video" playsinline muted></video><div class="row" style="justify-content:center;margin-top:10px"><button class="cam-shot">\u{1F4F8} Capture</button></div></div>';
    document.body.append(overlay);
    const video = overlay.querySelector("video");
    video.srcObject = stream;
    await video.play().catch(() => {
    });
    return new Promise((resolve) => {
      let done = false;
      const finish = (file) => {
        if (done) return;
        done = true;
        stream.getTracks().forEach((t) => t.stop());
        overlay.remove();
        resolve(file);
      };
      overlay.querySelector(".cam-close").addEventListener("click", () => finish(null));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(null);
      });
      overlay.querySelector(".cam-shot").addEventListener("click", () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) {
          setStatus("Camera not ready yet \u2014 try again.", "error");
          return;
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(video, 0, 0, w, h);
        c.toBlob((b) => finish(b ? new File([b], "photo.jpg", { type: b.type || "image/jpeg" }) : null), "image/jpeg", 0.92);
      });
    });
  }
  function openCropModal(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus("Could not read that image.", "error");
        resolve(null);
      };
      img.onload = () => {
        const VIEW = 300;
        const overlay = document.createElement("div");
        overlay.className = "modal";
        overlay.innerHTML = `<div class="modal-box" style="max-width:360px"><div class="modal-head"><span>\u2702\uFE0F Position your cover</span><button class="secondary crop-cancel">\u2715 Cancel</button></div><canvas class="crop-canvas" width="${VIEW}" height="${VIEW}"></canvas><label style="margin-top:10px">Zoom</label><input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="1" style="width:100%" /><p class="muted" style="font-size:11px;margin:6px 0 12px">Drag to position, slide to zoom. Saved as a ${COVER_OUT}\xD7${COVER_OUT} WebP \u2014 small for on-chain storage.</p><div class="row" style="justify-content:flex-end;gap:8px"><button class="secondary crop-cancel2">Cancel</button><button class="crop-use">Use this crop</button></div></div>`;
        document.body.appendChild(overlay);
        const canvas = overlay.querySelector(".crop-canvas");
        const ctx = canvas.getContext("2d");
        const zoom = overlay.querySelector(".crop-zoom");
        const base = Math.max(VIEW / img.width, VIEW / img.height);
        let z = 1, ox = 0, oy = 0;
        const dims = () => ({ w: img.width * base * z, h: img.height * base * z });
        const clamp2 = () => {
          const { w, h } = dims();
          ox = Math.min(0, Math.max(VIEW - w, ox));
          oy = Math.min(0, Math.max(VIEW - h, oy));
        };
        const draw = () => {
          const { w, h } = dims();
          ctx.fillStyle = "#0d1117";
          ctx.fillRect(0, 0, VIEW, VIEW);
          ctx.drawImage(img, ox, oy, w, h);
        };
        {
          const { w, h } = dims();
          ox = (VIEW - w) / 2;
          oy = (VIEW - h) / 2;
        }
        draw();
        let drag = false, lx = 0, ly = 0;
        canvas.addEventListener("pointerdown", (e) => {
          drag = true;
          lx = e.clientX;
          ly = e.clientY;
          canvas.setPointerCapture(e.pointerId);
          canvas.classList.add("grabbing");
        });
        canvas.addEventListener("pointermove", (e) => {
          if (!drag) return;
          const k = canvas.width / (canvas.clientWidth || canvas.width);
          ox += (e.clientX - lx) * k;
          oy += (e.clientY - ly) * k;
          lx = e.clientX;
          ly = e.clientY;
          clamp2();
          draw();
        });
        const endDrag = () => {
          drag = false;
          canvas.classList.remove("grabbing");
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
        zoom.addEventListener("input", () => {
          const nz = parseFloat(zoom.value);
          const r = nz / z;
          const c = VIEW / 2;
          ox = c - (c - ox) * r;
          oy = c - (c - oy) * r;
          z = nz;
          clamp2();
          draw();
        });
        const close = (b) => {
          URL.revokeObjectURL(url);
          overlay.remove();
          resolve(b);
        };
        overlay.querySelector(".crop-cancel").addEventListener("click", () => close(null));
        overlay.querySelector(".crop-cancel2").addEventListener("click", () => close(null));
        overlay.querySelector(".crop-use").addEventListener("click", () => {
          const s = base * z, sx = -ox / s, sy = -oy / s, sSize = VIEW / s;
          const out = document.createElement("canvas");
          out.width = COVER_OUT;
          out.height = COVER_OUT;
          out.getContext("2d").drawImage(img, sx, sy, sSize, sSize, 0, 0, COVER_OUT, COVER_OUT);
          out.toBlob((b) => {
            if (b && b.type === "image/webp") close(b);
            else out.toBlob((j) => close(j), "image/jpeg", 0.85);
          }, "image/webp", 0.8);
        });
      };
      img.src = url;
    });
  }
  function chosenLicense() {
    const sel = $("edLicense");
    if (sel == null) return "";
    if (sel.value === "__custom") return ($("edLicenseCustom")?.value ?? "").trim();
    return sel.value;
  }
  async function downscaleWebp(bytes, mimeType, maxDim) {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }));
    const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((res) => cv.toBlob(res, "image/webp", 0.85));
    if (blob == null) throw new Error("preview encode failed");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }
  var publishTier = "unlimited";
  function setPublishTier(t) {
    publishTier = t;
    const btnIds = { unlimited: "btnTierUnlimited", limited: "btnTierLimited", exclusive: "btnTierExclusive" };
    for (const [tier, id] of Object.entries(btnIds)) $(id)?.classList.toggle("active", tier === t);
    const covenant = t === "unlimited";
    document.querySelectorAll(".covenant-only").forEach((el) => {
      el.hidden = !covenant;
    });
    const countInput = $("edCount");
    if (countInput != null) {
      if (t === "exclusive") {
        countInput.value = "1";
        countInput.disabled = true;
      } else countInput.disabled = false;
    }
    const countLabel = $("edCountLabel");
    if (countLabel != null) countLabel.textContent = t === "exclusive" ? "Only one exists (1-of-1)" : t === "limited" ? "How many exist (the whole run)" : "Editions to mint now";
    const hint = $("tierHint");
    if (hint != null) hint.textContent = covenant ? "Unlimited: a covenant edition anyone can replicate \u2014 every copy pays you + the reseller on-chain, no marketplace needed." : t === "limited" ? "Limited: a fixed run (e.g. \u201Conly 10\u201D). Provable scarcity \u2014 you hold them and transfer one per sale." : "Exclusive: a single 1-of-1. Top-tier scarcity \u2014 transferred to the one buyer.";
    const btn = $("btnMintEdition");
    if (btn != null) btn.textContent = covenant ? "Mint edition collection" : t === "exclusive" ? "Mint exclusive 1-of-1" : "Mint limited collection";
  }
  async function onMintEdition() {
    const k = requireKey();
    if (k == null) return;
    const name = val("edName");
    if (!name) {
      setStatus("Enter an edition collection name.", "error");
      return;
    }
    const count = Math.max(1, parseInt(val("edCount") || "1", 10));
    const encrypt2 = $("edEncrypt").checked;
    const description = val("edDescription");
    const license = chosenLicense();
    const combineMode = $("edCombine")?.checked ?? false;
    try {
      const mockupF = $("edMockupFile")?.files?.[0];
      if (mockupF) {
        const bundle = readMockupBundle(Array.from(new Uint8Array(await mockupF.arrayBuffer())));
        if (bundle == null) {
          setStatus("That isn\u2019t a mockup .bmc bundle (no mockup.json inside).", "error");
          return;
        }
        const isCov = publishTier === "unlimited";
        const terms2 = isCov ? ownTerms() : null;
        const supply = publishTier === "exclusive" ? 1 : count;
        const propTxid = val("edMockupProp").trim() || bundle.recipe.propTxid || void 0;
        setStatus("Deriving preview\u2026");
        const dmime = bundle.designMime;
        const preview = await downscaleWebp(bundle.design, dmime, 1024);
        const dbmp = await createImageBitmap(new Blob([new Uint8Array(bundle.design)], { type: dmime }));
        const ratio = ratioOf(dbmp.width, dbmp.height);
        dbmp.close?.();
        setStatus(propTxid ? "Minting mockup product\u2026" : `Minting prop (${RATIOS[ratio].name}), then product\u2026`);
        const res = await mintMockupProduct(provider, k, {
          base: bundle.base,
          cleanDesign: { mimeType: dmime, bytes: bundle.design },
          previewDesign: { mimeType: "image/webp", bytes: preview },
          recipe: bundle.recipe,
          propTxid,
          ratio,
          productName: name,
          description: description || void 0,
          encrypt: encrypt2,
          license: license || void 0,
          supply,
          ...terms2 ? { covenant: { terms: terms2 } } : {},
          confirmSpend: (total) => confirm(
            `Mint \u201C${name}\u201D as a ${isCov ? "covenant-edition" : publishTier === "exclusive" ? "exclusive 1-of-1" : `limited \xD7${supply}`} product mockup?

${propTxid ? "Reusing prop " + short(propTxid) : "Minting a NEW prop"} + the product${encrypt2 ? " (encrypted design)" : ""}.
` + (isCov ? `Buyers later pay publisher ${terms2.publisherFeeSats} + holder ${terms2.holderFeeSats} sats/copy (refundable ${(terms2.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond each).
` : "") + `
This spends ${total.toLocaleString()} sats from your wallet. Proceed?`
          )
        });
        if (terms2 && res.editions) for (const e of res.editions) storeEdition(e, res.productTxid, name, terms2);
        else if (res.tokenOutpoints) for (const op3 of res.tokenOutpoints) store2.add({ txId: op3.txId, outputIndex: op3.outputIndex, collectionId: res.productTxid, stateData: "", collectionName: name });
        renderTokens();
        setStatusHtml(`\u2705 Minted mockup product ${idChip(res.productTxid)} \xB7 prop ${idChip(res.propTxid)}. ${isCov ? "Covenant edition \u2014 o" : "O"}nboard a copy to the site wallet, then it appears on Big Red next curator run.`, "ok");
        return;
      }
      const file = combineMode ? await buildCombinedManifest(name) : await readContent($("edFile"), name);
      if (combineMode && file == null) {
        setStatus("Combine mode: pick at least 2 of your collections to bundle.", "error");
        return;
      }
      const cover = croppedCover ?? await readFile($("edCover"));
      const backCover = await readFile($("edBackCover"));
      if (encrypt2 && !file) {
        setStatus("Encryption needs a file \u2014 attach one or uncheck encrypt.", "error");
        return;
      }
      const manifestRefs = file != null && isManifest(file.mimeType, file.bytes) ? parseManifest(file.bytes) : null;
      const trackCount = file?.mimeType === ALBUM_MIME ? parseAlbum(file.bytes)?.length ?? 0 : 0;
      const fileLabel = file == null ? "" : manifestRefs != null ? ` (an EP referencing ${manifestRefs.length} mint${manifestRefs.length === 1 ? "" : "s"} \u2014 no re-upload)` : trackCount > 0 ? ` (embedding a ${trackCount}-track album, ${kb(file.bytes.length)})` : ` (embedding a ${kb(file.bytes.length)} file)`;
      if (file != null && !confirmAudioFidelity(file)) {
        setStatus("Mint cancelled \u2014 compress the file first, or proceed as-is when you\u2019re ready.");
        return;
      }
      if (publishTier !== "unlimited") {
        const exclusive = publishTier === "exclusive";
        const supply = exclusive ? 1 : count;
        setStatus("Preparing the mint\u2026");
        const result2 = await createCollection(provider, k, {
          tokenName: name,
          supply,
          mintCount: supply,
          file,
          encrypt: encrypt2,
          description,
          cover,
          backCover,
          license,
          confirmSpend: (total) => confirm(
            `Mint ${exclusive ? "an exclusive 1-of-1" : `a limited run of ${supply}`} \u2014 \u201C${name}\u201D${encrypt2 ? " (encrypted)" : ""}${fileLabel}?

This spends ${total.toLocaleString()} sats from your wallet (network fee + ${supply} \xD7 1-sat token${supply > 1 ? "s" : ""}).

Proceed?`
          )
        });
        for (const op3 of result2.tokenOutpoints) {
          store2.add({ txId: op3.txId, outputIndex: op3.outputIndex, collectionId: result2.collectionId, stateData: "", collectionName: name });
        }
        renderTokens();
        setStatusHtml(`Minted ${result2.tokenOutpoints.length} ${exclusive ? "exclusive" : "limited"} edition(s). Collection ${idChip(result2.collectionId)} (TX1 ${idChip(result2.tx1Id)}, TX2 ${idChip(result2.tx2Id)}).`, "ok");
        return;
      }
      const terms = ownTerms();
      setStatus("Preparing the edition mint\u2026");
      const result = await createEdition(provider, k, {
        tokenName: name,
        terms,
        mintCount: count,
        file,
        encrypt: encrypt2,
        description,
        cover,
        backCover,
        license,
        confirmSpend: (total) => confirm(
          `Mint ${count} edition${count > 1 ? "s" : ""} of \u201C${name}\u201D${encrypt2 ? " (encrypted)" : ""}${fileLabel}?

This spends ${total.toLocaleString()} sats from your wallet \u2014 including a refundable ${(terms.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond per edition (reclaimable by burning), plus the network fee.

Buyers later pay the publisher ${terms.publisherFeeSats} + holder ${terms.holderFeeSats} sats per copy.

Proceed?`
        )
      });
      for (const e of result.editions) storeEdition(e, result.collectionId, name, terms);
      renderTokens();
      setStatusHtml(`Minted ${result.editions.length} edition(s). Collection ${idChip(result.collectionId)} (TX2 ${idChip(result.tx2Id)}).`, "ok");
    } catch (e) {
      if (e.message === SPEND_CANCELLED) {
        setStatus("Edition mint cancelled \u2014 nothing was spent.");
        return;
      }
      setStatus(`Edition mint failed: ${e.message}`, "error");
    }
  }
  async function buildCombinedManifest(epName) {
    const ids = checkedCombineIds();
    if (ids.length < 2) return void 0;
    setStatus(`Reading ${ids.length} collections to build the EP\u2026`);
    const refs = [];
    for (const id of ids) {
      const info = await loadCollection(id);
      if (!info.hasContentFile || info.fileHash == null) throw new Error(`"${info.name || short(id)}" has no embedded content to reference`);
      if (info.encrypted) throw new Error(`"${info.name || short(id)}" is encrypted \u2014 EPs can only reference public content for now`);
      refs.push({ id, hash: info.fileHash, name: info.name || short(id), mimeType: "application/octet-stream" });
    }
    const safe = (epName || "ep").replace(/[^\w.-]+/g, "_");
    return { mimeType: MANIFEST_MIME, fileName: `${safe}.pref`, bytes: packManifest(refs) };
  }
  function checkedCombineIds() {
    return Array.from(document.querySelectorAll(".combine-pick:checked")).map((c) => c.value);
  }
  function updateCombineHint() {
    const hint = $("edCombineHint");
    if (hint == null) return;
    const n = checkedCombineIds().length;
    hint.textContent = n < 2 ? `Select 2 or more (${n} picked).` : `${n} selected \u2014 they\u2019ll play as one EP.`;
  }
  function renderCombinePicker() {
    const list = $("edCombineList");
    if (list == null) return;
    list.innerHTML = "";
    const seen = /* @__PURE__ */ new Set();
    const cols = store2.active().filter((t) => {
      if (seen.has(t.collectionId)) return false;
      seen.add(t.collectionId);
      return true;
    });
    if (cols.length === 0) {
      list.innerHTML = '<li class="muted" style="font-size:12px">No collections in this wallet yet \u2014 mint or hold some singles first.</li>';
      updateCombineHint();
      return;
    }
    for (const t of cols) {
      const li = document.createElement("li");
      li.className = "combine-row";
      const label = document.createElement("label");
      label.className = "check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "combine-pick";
      cb.value = t.collectionId;
      cb.onchange = updateCombineHint;
      label.append(cb, document.createTextNode(" " + (t.collectionName || short(t.collectionId))));
      const idSpan = document.createElement("span");
      idSpan.className = "muted";
      idSpan.style.fontSize = "11px";
      idSpan.textContent = short(t.collectionId);
      li.append(label, idSpan);
      list.append(li);
    }
    updateCombineHint();
  }
  async function noteToPropagate(t) {
    try {
      const p = await resolveSellerNote(provider, pubKeyHex, t.collectionId);
      if (p && noteHasContent(p)) return p;
    } catch {
    }
    if (t.sellerNote || t.bonusValue) return { text: t.sellerNote ?? "", bonusKind: t.bonusKind, bonusValue: t.bonusValue };
    return void 0;
  }
  async function pruneIfEditionSpent(t) {
    if (!t.lockHex) return false;
    try {
      const unspent = await provider.getUnspentByScriptHash(wocScriptHash(hexBytes(t.lockHex)));
      if (unspent.some((u) => u.txId === t.txId && u.outputIndex === t.outputIndex)) return false;
      store2.markSent(t.txId, t.outputIndex);
      renderTokens();
      return true;
    } catch {
      return false;
    }
  }
  async function onReplicate(t) {
    const k = requireKey();
    if (k == null) return;
    if (!t.lockHex) {
      setStatus("Missing edition script; cannot replicate.", "error");
      return;
    }
    const name = t.collectionName ?? "this edition";
    const bondNote = editionSupportsBurn(hexBytes(t.lockHex)) ? "a refundable bond for your copy (reclaim it by burning) + " : "";
    setStatus("Preparing the replication\u2026");
    try {
      const note = await noteToPropagate(t);
      const r = await replicateEdition(provider, k, {
        editionTxId: t.txId,
        editionOutputIndex: t.outputIndex,
        editionLockHex: t.lockHex,
        terms: termsFromToken(t),
        note,
        confirmSpend: (total) => confirm(
          `Replicate a copy of \u201C${name}\u201D?

This spends ${total.toLocaleString()} sats from your wallet (${bondNote}publisher ${t.publisherFeeSats ?? 0} + holder ${t.holderFeeSats ?? 0} fees + network fee).

Proceed?`
        )
      });
      store2.markSent(t.txId, t.outputIndex);
      storeEdition(
        { txId: r.txId, outputIndex: 0, lockHex: t.lockHex },
        t.collectionId,
        t.collectionName ?? "Edition",
        termsFromToken(t),
        t.sellerNote || t.bonusValue ? { text: t.sellerNote ?? "", bonusKind: t.bonusKind, bonusValue: t.bonusValue } : null
      );
      storeEdition(
        { txId: r.replicaOutpoint.txId, outputIndex: r.replicaOutpoint.outputIndex, lockHex: r.lockHex },
        t.collectionId,
        t.collectionName ?? "Edition",
        termsFromToken(t),
        note
      );
      renderTokens();
      setStatus(`\u2705 Replicated. Tx ${short(r.txId)} \u2014 NFT returned to holder, replica minted, fees paid.`, "ok");
    } catch (e) {
      const msg = e.message;
      if (msg === SPEND_CANCELLED) {
        setStatus("Replication cancelled \u2014 nothing was spent.");
        return;
      }
      if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
        setStatus("That edition had already been spent (moved or burned elsewhere) \u2014 removed it from your holdings.", "ok");
        return;
      }
      setStatus(`Replicate failed: ${msg}`, "error");
    }
  }
  async function onTransferEdition(t) {
    const k = requireKey();
    if (k == null) return;
    const recipient = val("sendPubKey");
    if (recipient.length !== 66 && recipient.length !== 130) {
      setStatus("Enter the recipient's public key (33- or 65-byte hex) above.", "error");
      return;
    }
    if (!t.lockHex) {
      setStatus("Missing edition script; cannot transfer.", "error");
      return;
    }
    setStatus("Transferring edition (owner-signed, re-creating covenant)\u2026");
    try {
      const note = await noteToPropagate(t);
      const r = await transferEdition(provider, k, {
        editionTxId: t.txId,
        editionOutputIndex: t.outputIndex,
        editionLockHex: t.lockHex,
        newOwnerPubKey: hexBytes(recipient),
        note
      });
      store2.markSent(t.txId, t.outputIndex);
      renderTokens();
      setStatus(`\u2705 Transferred. Tx ${short(r.txId)} \u2014 covenant re-created for the new owner.`, "ok");
    } catch (e) {
      const msg = e.message;
      if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
        setStatus("That edition had already been spent (moved or burned elsewhere) \u2014 removed it from your holdings.", "ok");
        return;
      }
      setStatus(`Transfer failed: ${msg}`, "error");
    }
  }
  var pendingListPartner = null;
  async function onOnboardPartner(t) {
    const k = requireKey();
    if (k == null) return;
    if (!t.lockHex) {
      setStatus("Missing edition script; cannot onboard.", "error");
      return;
    }
    const name = t.collectionName ?? "this collection";
    let partner;
    if (pendingListPartner) {
      partner = pendingListPartner;
      if (!confirm(`List \u201C${name}\u201D on listing wallet ${short(partner)}?

This sends one copy there; that wallet then holds and resells it, earning the reseller fee on each sale. You keep your other copies and your publisher fee.`)) return;
    } else {
      partner = (prompt(
        `List \u201C${name}\u201D through a partner wallet.

Paste the PUBLIC KEY (66-hex) of the listing wallet \u2014 a curation site's, or your own cold listing wallet. You'll transfer THIS copy to it; that wallet then holds and resells the copy, collecting the reseller fee on every sale made through its link. (You keep your other copies.)`
      ) ?? "").trim().toLowerCase();
      if (partner === "") return;
      if (!/^0[23][0-9a-f]{64}$/.test(partner)) {
        setStatus("That isn\u2019t a 33-byte compressed public key (66 hex, starting 02 or 03).", "error");
        return;
      }
      if (!confirm(`Transfer one copy of \u201C${name}\u201D to ${short(partner)}? That wallet then holds and resells this copy.`)) return;
    }
    setStatus("Onboarding partner (transferring a copy)\u2026");
    try {
      const note = await noteToPropagate(t);
      const r = await transferEdition(provider, k, {
        editionTxId: t.txId,
        editionOutputIndex: t.outputIndex,
        editionLockHex: t.lockHex,
        newOwnerPubKey: hexBytes(partner),
        note
      });
      store2.markSent(t.txId, t.outputIndex);
      renderTokens();
      pendingListPartner = null;
      const link = collectionShareUrl(t.collectionId, partner);
      setStatus(`\u2705 Partner onboarded. Tx ${short(r.txId)} \u2014 share their listing link.`, "ok");
      showPartnerLinkModal(name, link, partner);
    } catch (e) {
      const msg = e.message;
      if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
        setStatus("That copy had already been spent (moved or burned elsewhere) \u2014 removed it from your holdings.", "ok");
        return;
      }
      setStatus(`Onboarding failed: ${msg}`, "error");
    }
  }
  function showPartnerLinkModal(name, link, partnerPubKey) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `<div class="modal-box" style="max-width:520px"><div class="modal-head"><span>\u{1F91D} Listing partner onboarded</span><button class="secondary pl-close">\u2715 Close</button></div><p class="muted" style="font-size:13px;margin:0 0 10px">A copy of \u201C${escapeHtml(name)}\u201D now sits in the wallet you entered \u2014 your <b>listing partner</b> (a curation site, or your own listing wallet). Share its link below: every buyer mints their own copy from it, so that wallet <b>collects the reseller fee</b> on each sale, while the <b>publisher fee</b> goes to the collection\u2019s publisher. The copy isn\u2019t used up \u2014 it keeps selling.</p><label>Partner listing link</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input class="pl-link mono" readonly value="${escapeHtml(link)}" style="flex:1 1 auto;min-width:0" /><button class="secondary pl-copy">Copy</button><button class="secondary pl-qr">QR</button></div><p class="muted" style="font-size:11px;margin:10px 0 0">Partner key: <span class="mono">${escapeHtml(partnerPubKey)}</span></p></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".pl-close")?.addEventListener("click", close);
    overlay.querySelector(".pl-copy")?.addEventListener("click", () => void navigator.clipboard?.writeText(link));
    overlay.querySelector(".pl-qr")?.addEventListener("click", () => showQrModal("Partner listing link", link));
    document.body.append(overlay);
  }
  async function onBurn(t) {
    const k = requireKey();
    if (k == null) return;
    if (!t.lockHex) {
      setStatus("Missing edition script; cannot burn.", "error");
      return;
    }
    if (!confirm(
      `Burn your edition of \u201C${t.collectionName ?? "this collection"}\u201D and reclaim its ~${(t.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond (minus a small network fee) to your wallet?

\u26A0 This DESTROYS the token permanently \u2014 it cannot be undone. Proceed?`
    )) return;
    setStatus("Burning edition (reclaiming the bond)\u2026");
    try {
      const r = await burnEdition(provider, k, { editionTxId: t.txId, editionOutputIndex: t.outputIndex, editionLockHex: t.lockHex });
      store2.markSent(t.txId, t.outputIndex);
      renderTokens();
      setStatus(`\u{1F525} Burned. Reclaimed ${r.reclaimSats.toLocaleString()} sats to your wallet. Tx ${short(r.txId)}.`, "ok");
    } catch (e) {
      const msg = e.message;
      console.error(`[burn] failed for ${t.txId}:${t.outputIndex} \u2014`, msg);
      if (/missing inputs|missingorspent/i.test(msg)) {
        const pruned = await pruneIfEditionSpent(t);
        setStatus(pruned ? "This edition had already been spent (moved or burned elsewhere) \u2014 removed it from your holdings." : "Burn failed: this edition isn\u2019t confirmed/propagated yet. Wait a few minutes, then try again.", pruned ? "ok" : "error");
      } else if (/raw TX fetch failed/i.test(msg)) {
        setStatus("Burn failed: this edition\u2019s transaction isn\u2019t on-chain yet. Wait for it to confirm (usually a few minutes), then try again.", "error");
      } else {
        setStatus(`Burn failed: ${msg}`, "error");
      }
    }
  }
  function downloadText(filename, text, mime = "text/plain") {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function readFileText(input) {
    const f = input.files?.[0];
    return f ? f.text() : Promise.resolve(null);
  }
  function populateAirgapEditions() {
    const sel = document.getElementById("agEdition");
    if (sel == null) return;
    const prev = sel.value;
    const held = store2.active().filter((t) => t.kind === "edition" && t.lockHex);
    sel.innerHTML = held.length === 0 ? '<option value="">(no editions held)</option>' : held.map((t) => `<option value="${t.txId}:${t.outputIndex}">${escapeHtml(t.collectionName ?? "Edition")} \xB7 ${short(t.txId, 6)}:${t.outputIndex}</option>`).join("");
    if (held.some((t) => `${t.txId}:${t.outputIndex}` === prev)) sel.value = prev;
  }
  function syncAirgapAction() {
    const action = document.querySelector('input[name="agAction"]:checked')?.value;
    const row = document.getElementById("agRecipientRow");
    if (row != null) row.style.display = action === "burn" ? "none" : "";
  }
  async function onAirgapExport() {
    const t = store2.active().find((x) => `${x.txId}:${x.outputIndex}` === val("agEdition"));
    if (t == null || !t.lockHex) {
      setStatus("Select an edition to export.", "error");
      return;
    }
    const action = document.querySelector('input[name="agAction"]:checked')?.value ?? "transfer";
    const recipient = val("agRecipient");
    if (action === "transfer" && recipient.length !== 66 && recipient.length !== 130) {
      setStatus("Enter the recipient's public key (33- or 65-byte hex) to export a transfer.", "error");
      return;
    }
    setStatus("Gathering inputs for the offline signer\u2026");
    try {
      const sourceTx = await provider.getSourceTransaction(t.txId);
      const bond = sourceTx.outputs[t.outputIndex]?.value ?? PHARLAP_OUTPUT_SATS;
      const edition = { txId: t.txId, outputIndex: t.outputIndex, satoshis: bond, lockBytes: hexBytes(t.lockHex), sourceTx };
      const name = t.collectionName ?? "edition";
      let req;
      if (action === "burn") {
        req = buildAirgapRequest("burn", edition, {
          summary: `Burn edition of \u201C${name}\u201D (${short(t.txId, 6)}:${t.outputIndex}); reclaim ~${bond.toLocaleString()} sats to the signer's wallet.`
        });
      } else {
        const note = await noteToPropagate(t);
        const noteSats = note ? PHARLAP_OUTPUT_SATS : 0;
        const estFee = Math.ceil(1500 * DEFAULT_FEE_PER_KB / 1e3);
        const selected = selectFunding(await getSafeUtxos(provider), noteSats + estFee + 1e3);
        const funding = await Promise.all(selected.map(async (u) => ({ utxo: u, sourceTx: await provider.getSourceTransaction(u.txId) })));
        req = buildAirgapRequest("transfer", edition, {
          newOwnerPubKeyHex: recipient,
          note,
          funding,
          summary: `Transfer edition of \u201C${name}\u201D (${short(t.txId, 6)}:${t.outputIndex}) to ${short(recipient, 8)}; ${bond.toLocaleString()}-sat bond rides forward.`
        });
      }
      downloadText(`smartnfts-${action}-${t.txId.slice(0, 8)}.airgap-request.json`, encodeAirgapRequest(req), "application/json");
      setStatus(`\u2705 Exported ${action} request. Move the file to your offline machine and sign it there (step 2).`, "ok");
    } catch (e) {
      setStatus(`Export failed: ${e.message}`, "error");
    }
  }
  var pendingSignReq = null;
  async function onAirgapSignFile() {
    pendingSignReq = null;
    const sumEl = $("agSignSummary");
    const btn = $("btnAgSign");
    const txt = await readFileText($("agSignFile"));
    if (txt == null) {
      sumEl.textContent = "";
      btn.disabled = true;
      return;
    }
    try {
      const req = decodeAirgapRequest(txt);
      pendingSignReq = req;
      sumEl.textContent = `${req.action.toUpperCase()} \u2014 ${req.summary ?? "(no summary in request)"}`;
      sumEl.style.color = "";
      btn.disabled = false;
    } catch (e) {
      sumEl.textContent = `\u26A0 Not a valid request: ${e.message}`;
      sumEl.style.color = "var(--err, #f85149)";
      btn.disabled = true;
    }
  }
  async function onAirgapSign() {
    const k = requireKey();
    if (k == null) return;
    if (pendingSignReq == null) {
      setStatus("Import a request file first.", "error");
      return;
    }
    setStatus("Signing offline\u2026");
    try {
      const { txId, rawTx } = await signAirgapRequest(pendingSignReq, k);
      downloadText(`smartnfts-signed-${txId.slice(0, 8)}.txt`, rawTx);
      setStatusHtml(`\u2705 Signed (tx ${idChip(txId)}). Move the signed file to your online machine and broadcast it (step 3).`, "ok");
    } catch (e) {
      setStatus(`Sign failed: ${e.message}`, "error");
    }
  }
  var cosignRaw = null;
  var cosignSources = [];
  var cosignSigned = null;
  async function onCosignRead() {
    cosignRaw = null;
    cosignSigned = null;
    cosignSources = [];
    $("btnCsSign").disabled = true;
    $("btnCsBroadcast").disabled = true;
    const rep = $("csReport");
    rep.innerHTML = "";
    let hex = val("csHex");
    if (hex.length === 0) hex = (await readFileText($("csFile")) ?? "").trim();
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20) {
      setStatus("Paste or import an unsigned transaction first.", "error");
      return;
    }
    setStatus("Reading the transaction and fetching its inputs\u2026");
    try {
      const tx = Tx.parse(hex);
      const ids = [...new Set(tx.inputs.map((i) => wireToTxid(i.txid)))];
      const sources = [];
      for (const id of ids) {
        try {
          sources.push({ txId: id, sourceTxHex: (await provider.getSourceTransaction(id)).hex() });
        } catch {
        }
      }
      cosignRaw = hex;
      cosignSources = sources;
      const a = analyseCosign(hex, sources, address);
      renderCosign(a);
      if (a.blockers.length === 0 && !isWatchOnly()) $("btnCsSign").disabled = false;
      setStatus(
        a.blockers.length > 0 ? "This transaction cannot be signed here \u2014 see below." : "Read it. Check the figures below before signing.",
        a.blockers.length > 0 ? "error" : "ok"
      );
    } catch (e) {
      setStatus(`Could not read that transaction: ${e.message}`, "error");
    }
  }
  function renderCosign(a) {
    const sat = (n) => `${n.toLocaleString()} sat`;
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const rows = [];
    rows.push(`<div style="margin-bottom:8px"><b>Signing this would cost you ${sat(a.youPay)}</b> <span class="muted">(${sat(a.youSpend)} in, ${sat(a.youReceive)} back)</span></div>`);
    rows.push(`<div class="muted">fee ${sat(a.fee)} \xB7 ${a.feePerKb.toLocaleString()} sat/KB \xB7 ${a.signedSize.toLocaleString()} bytes signed</div>`);
    rows.push('<div style="margin-top:8px"><b>Inputs</b></div>');
    for (const i of a.inputs) {
      const who = i.mine ? "<b>yours</b>" : i.complete ? "already signed by someone else" : "not yours, not signed";
      const v = i.satoshis == null ? '<span style="color:var(--err,#f85149)">value unknown</span>' : sat(i.satoshis);
      rows.push(`<div class="muted">#${i.index + 1} ${v} \u2014 ${who}${a.toSign.includes(i.index) ? " \u2192 <b>will be signed</b>" : ""}</div>`);
    }
    rows.push('<div style="margin-top:8px"><b>Outputs</b></div>');
    for (const o of a.outputs) {
      let what;
      if (o.kind === "yours") what = "<b>back to you</b>";
      else if (o.kind === "address") what = `to ${esc(o.address ?? "?")}`;
      else if (o.kind === "data") what = `data \xB7 <span style="opacity:.85">${esc(o.text ?? "")}</span>`;
      else what = `a script this wallet cannot name (${o.scriptSize} bytes)`;
      rows.push(`<div class="muted">#${o.index + 1} ${sat(o.satoshis)} \u2014 ${what}</div>`);
    }
    for (const w of a.warnings) rows.push(`<div style="margin-top:6px;color:#d29922">\u26A0 ${esc(w)}</div>`);
    for (const b of a.blockers) rows.push(`<div style="margin-top:6px;color:var(--err,#f85149)"><b>Refusing:</b> ${esc(b)}</div>`);
    $("csReport").innerHTML = rows.join("");
  }
  async function onCosignSign() {
    const k = requireKey();
    if (k == null) return;
    if (cosignRaw == null) {
      setStatus("Read a transaction first.", "error");
      return;
    }
    setStatus("Signing your inputs\u2026");
    try {
      const { txId, rawTx } = await cosignTransaction(cosignRaw, cosignSources, k);
      cosignSigned = rawTx;
      $("csHex").value = rawTx;
      $("btnCsBroadcast").disabled = false;
      downloadText(`cosigned-${txId.slice(0, 8)}.txt`, rawTx);
      setStatusHtml(`\u2705 Signed (tx ${idChip(txId)}). Broadcast it here, or send the downloaded file wherever it needs to go.`, "ok");
    } catch (e) {
      setStatus(`Sign failed: ${e.message}`, "error");
    }
  }
  async function onCosignBroadcast() {
    if (cosignSigned == null) {
      setStatus("Sign the transaction first.", "error");
      return;
    }
    setStatus("Broadcasting\u2026");
    try {
      const txId = await provider.broadcast(cosignSigned);
      setStatusHtml(`\u2705 Broadcast. Tx ${idChip(txId)}.`, "ok");
    } catch (e) {
      setStatus(`Broadcast failed: ${e.message}`, "error");
    }
  }
  async function onAirgapBroadcast() {
    let hex = val("agBcHex");
    if (hex.length === 0) hex = (await readFileText($("agBcFile")) ?? "").trim();
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20) {
      setStatus("Import or paste the signed raw-tx hex first.", "error");
      return;
    }
    setStatus("Broadcasting signed transaction\u2026");
    try {
      const txId = await provider.broadcast(hex);
      $("agBcHex").value = "";
      setStatusHtml(`\u2705 Broadcast. Tx ${idChip(txId)}. Refresh balance / check holdings to see it settle.`, "ok");
    } catch (e) {
      setStatus(`Broadcast failed: ${e.message}`, "error");
    }
  }
  function readSendBsvForm() {
    const toAddress = val("sendBsvAddr");
    const sendMax = $("sendBsvMax").checked;
    try {
      assertValidAddress(toAddress);
    } catch {
      setStatus("Enter a valid recipient BSV address.", "error");
      return null;
    }
    const amountSats = sendMax ? 0 : Math.floor(Number(val("sendBsvAmount")));
    if (!sendMax && (!Number.isFinite(amountSats) || amountSats < 1)) {
      setStatus("Enter an amount of at least 1 sat (or tick \u201CSend max\u201D).", "error");
      return null;
    }
    return { toAddress, amountSats, sendMax };
  }
  async function onSendBsv() {
    const k = requireKey();
    if (k == null) return;
    const form = readSendBsvForm();
    if (form == null) return;
    if (!confirm(`Send ${form.sendMax ? "your entire spendable balance" : `${form.amountSats.toLocaleString()} sats`} to
${form.toAddress}?

(Minus the network fee. Change returns to this wallet.)`)) return;
    setStatus("Sending BSV\u2026");
    try {
      const r = await sendPayment(provider, k, form);
      $("sendBsvAddr").value = "";
      $("sendBsvAmount").value = "";
      $("sendBsvMax").checked = false;
      setStatus(`\u2705 Sent ${r.sentSats.toLocaleString()} sats. Tx ${short(r.txId)}.`, "ok");
      void refreshBalance();
    } catch (e) {
      setStatus(`Send failed: ${e.message}`, "error");
    }
  }
  async function onSendBsvExport() {
    const form = readSendBsvForm();
    if (form == null) return;
    setStatus("Gathering funds for the offline signer\u2026");
    try {
      const funding = await gatherPaymentFunding(provider, form);
      if (funding.length === 0) {
        setStatus("No spendable funds to send.", "error");
        return;
      }
      const dry = await buildPaymentTx({ key: Signer.fromPrivateKey(crypto.getRandomValues(new Uint8Array(32))), funding, ...form });
      const req = buildAirgapPaymentRequest({
        ...form,
        funding: await Promise.all(funding.map(async (f) => ({ ...f, sourceTx: await provider.getSourceTransaction(f.utxo.txId) }))),
        summary: `Send ${dry.sentSats.toLocaleString()} sats to ${form.toAddress}${form.sendMax ? " (entire balance, minus fee)" : ""}.`
      });
      downloadText(`smartnfts-payment-${dry.txId.slice(0, 8)}.airgap-request.json`, encodeAirgapRequest(req), "application/json");
      setStatus(`\u2705 Exported payment request (${dry.sentSats.toLocaleString()} sats). Sign it on your offline machine (step 2 in Advanced), then broadcast (step 3).`, "ok");
    } catch (e) {
      setStatus(`Export failed: ${e.message}`, "error");
    }
  }
  async function onSend(txId, outputIndex) {
    const k = requireKey();
    if (k == null) return;
    const recipient = val("sendPubKey");
    if (recipient.length !== 66 && recipient.length !== 130) {
      setStatus("Enter the recipient's public key (33- or 65-byte hex).", "error");
      return;
    }
    setStatus("Sending NFT\u2026");
    try {
      const result = await createTransfer(provider, k, { tokenTxId: txId, tokenOutputIndex: outputIndex, recipientPubKeyHex: recipient });
      store2.markSent(txId, outputIndex);
      renderTokens();
      setStatus(`Sent. Transfer tx ${short(result.txId)} (recipient notified at output ${result.notifyVout}).`, "ok");
    } catch (e) {
      setStatus(`Send failed: ${e.message}`, "error");
    }
  }
  async function onSendMessage() {
    const k = requireKey();
    if (k == null) return;
    const to = val("msgTo");
    if (to.length !== 66 && to.length !== 130) {
      setStatus("Enter the recipient's public key (33- or 65-byte hex).", "error");
      return;
    }
    const text = $("msgText").value;
    const encrypt2 = $("msgEncrypt").checked;
    const file = await readFile($("msgFile"));
    const parts = [];
    if (text.trim()) parts.push({ kind: "text", text });
    if (file) parts.push({ kind: "file", mimeType: file.mimeType, fileName: file.fileName, bytes: file.bytes });
    if (parts.length === 0) {
      setStatus("Write a message or attach a file first.", "error");
      return;
    }
    setStatus(`Sending ${encrypt2 ? "encrypted" : "public"} message\u2026`);
    try {
      const r = await sendMessage(provider, k, { toPubKeyHex: to, parts, encrypt: encrypt2, senderAlias: getMyAlias() });
      $("msgText").value = "";
      setStatus(`Message sent. Tx ${short(r.txId)}.`, "ok");
    } catch (e) {
      setStatus(`Send message failed: ${e.message}`, "error");
    }
  }
  async function onPublishProfile() {
    const k = requireKey();
    if (k == null) return;
    const alias = getMyAlias();
    const file = await readFile($("profileAvatar"));
    let avatar;
    if (file != null) {
      if (!file.mimeType.startsWith("image/")) {
        setStatus("Avatar must be an image.", "error");
        return;
      }
      const small = await downscaleToAvatar(file.bytes, file.mimeType);
      if (small == null) {
        setStatus("Could not process that image (need a browser that encodes WebP).", "error");
        return;
      }
      avatar = small;
    }
    if (alias === "" && avatar == null) {
      setStatus("Set an alias (above) or choose an avatar image first.", "error");
      return;
    }
    if (!confirm(
      `Publish your profile on-chain${avatar ? ` (a ${kb(avatar.bytes.length)} avatar)` : ""}${alias ? ` as @${alias}` : ""}?

It's posted to your own address and spends a small network fee. Proceed?`
    )) return;
    setStatus("Publishing your profile\u2026");
    try {
      const txId = await publishProfile(provider, k, { alias: alias || void 0, avatar });
      if (avatar != null) {
        setAvatar(myPubKeyLc(), bytesToDataUrl(avatar.mimeType, avatar.bytes));
        renderWallet();
      }
      ;
      $("profileAvatar").value = "";
      setStatusHtml(`\u2705 Profile published. Tx ${idChip(txId)} \u2014 others now resolve your @name + avatar by your key.`, "ok");
    } catch (e) {
      setStatus(`Publish profile failed: ${e.message}`, "error");
    }
  }
  async function onCheckMessages() {
    const k = requireKey();
    if (k == null) return;
    setStatus("Checking for messages\u2026");
    try {
      const msgs = await scanIncomingMessages(provider, k);
      applyLatestAliases(msgs.map((m) => ({ pk: m.senderPubKeyHex, alias: m.senderAlias })));
      renderInbox(msgs);
      resolveAvatarsThen(msgs.map((m) => m.senderPubKeyHex), () => renderInbox(lastInbox));
      setStatus(`Inbox: ${msgs.length} message(s).`, "ok");
    } catch (e) {
      setStatus(`Check messages failed: ${e.message}`, "error");
    }
  }
  function renderInbox(msgs) {
    lastInbox = msgs;
    const host = $("inbox");
    if (msgs.length === 0) {
      host.innerHTML = '<p class="muted">No messages found.</p>';
      return;
    }
    host.innerHTML = "";
    for (const m of msgs) {
      const card2 = document.createElement("div");
      card2.className = "token msg";
      const textPart = m.parts.find((p) => p.kind === "text");
      const hasKey = m.parts.some((p) => p.kind === "key");
      const filePart = m.parts.find((p) => p.kind === "file");
      card2.innerHTML = `
      <div class="mono">from ${nameChip(m.senderPubKeyHex, { save: true })} ${m.encrypted ? "\u{1F512} encrypted" : "\u{1F310} public"}</div>
      ${m.sentAt ? `<div class="muted" style="font-size:11px" title="Sender's clock (self-asserted)">\u{1F552} ${escapeHtml(fmtTime(m.sentAt))}${m.height ? "" : " \xB7 pending"}</div>` : m.height ? "" : '<div class="muted" style="font-size:11px">pending</div>'}
      ${textPart && textPart.kind === "text" ? `<div class="state">${escapeHtml(textPart.text)}</div>` : ""}
      ${hasKey ? '<div class="muted" style="font-size:12px">\u{1F511} carries a content key</div>' : ""}
    `;
      const actions = document.createElement("div");
      actions.className = "actions";
      const reply = document.createElement("button");
      reply.textContent = "\u21A9 Reply";
      reply.className = "secondary";
      reply.onclick = () => onReply(m);
      actions.append(reply);
      if (filePart && filePart.kind === "file") {
        const btn = document.createElement("button");
        btn.textContent = `View ${filePart.fileName}`;
        btn.className = "secondary";
        btn.onclick = () => showFile("Message attachment", { mimeType: filePart.mimeType, fileName: filePart.fileName, fileBytes: filePart.bytes }, true);
        actions.append(btn);
      }
      card2.append(actions);
      host.append(card2);
    }
  }
  function onReply(m) {
    ;
    $("msgTo").value = m.senderPubKeyHex;
    $("msgEncrypt").checked = m.encrypted;
    updateMsgToName();
    $("msgTo").scrollIntoView({ behavior: "smooth", block: "start" });
    $("msgText").focus();
    const who = displayName(m.senderPubKeyHex);
    setStatus(`Replying to ${who.name}.`);
  }
  var nameCache = /* @__PURE__ */ new Map();
  var latestBroadcast = /* @__PURE__ */ new Map();
  async function resolveCollectionName(tx1RefHex) {
    const cached = nameCache.get(tx1RefHex);
    if (cached != null) return cached;
    let name = "Edition";
    try {
      const tx1 = await provider.getSourceTransaction(tx1RefHex);
      for (const o of tx1.outputs) {
        const t = parseTemplateScript(LockingScript.fromBinary(o.script));
        if (t && t.fields.tokenName) {
          name = t.fields.tokenName;
          break;
        }
      }
    } catch {
    }
    nameCache.set(tx1RefHex, name);
    return name;
  }
  async function onCheckIncoming() {
    setStatus("Scanning for incoming NFTs and editions\u2026");
    let added = 0;
    let edAdded = 0;
    const errors = [];
    try {
      const incoming = await scanIncoming(provider, pubKeyHex);
      for (const t of incoming) {
        const tx = await provider.getSourceTransaction(t.txId);
        const v = await verifyTokenLineage(tx, t.outputIndex, { getRawTransaction: (id) => provider.getSourceTransaction(id) });
        if (!v.valid) continue;
        if (store2.add({ txId: t.txId, outputIndex: t.outputIndex, collectionId: t.fields.tx1Ref, stateData: t.fields.stateData })) added++;
      }
    } catch (e) {
      errors.push(`tokens: ${e.message}`);
    }
    try {
      const editions = await scanIncomingEditions(provider, pubKeyHex);
      for (const e of editions) {
        const name = await resolveCollectionName(e.tx1RefHex);
        if (store2.add({
          txId: e.txId,
          outputIndex: e.outputIndex,
          collectionId: e.tx1RefHex,
          stateData: "",
          collectionName: name,
          kind: "edition",
          lockHex: e.lockHex,
          publisherPubKeyHashHex: hexOf(e.terms.publisherPubKeyHash),
          publisherFeeSats: e.terms.publisherFeeSats,
          holderFeeSats: e.terms.holderFeeSats,
          ...e.sellerNote?.text ? { sellerNote: e.sellerNote.text } : {},
          ...e.sellerNote?.bonusValue ? { bonusKind: e.sellerNote.bonusKind, bonusValue: e.sellerNote.bonusValue } : {},
          ...e.height ? { heightHint: e.height } : {}
        })) edAdded++;
        else store2.setCollectionName(e.txId, e.outputIndex, name);
      }
    } catch (e) {
      errors.push(`editions: ${e.message}`);
    }
    renderTokens();
    if (errors.length > 0 && added === 0 && edAdded === 0) {
      setStatus(`Scan failed \u2014 ${errors.join("; ")}`, "error");
    } else {
      setStatus(`Scan complete: ${added} NFT(s) + ${edAdded} edition(s) new.${errors.length ? " (" + errors.join("; ") + ")" : ""}`, "ok");
    }
  }
  async function onVerify(txId, outputIndex) {
    setStatus("Verifying NFT lineage\u2026");
    try {
      const tx = await provider.getSourceTransaction(txId);
      const out = tx.outputs[outputIndex];
      if (out != null && parseEditionScript(LockingScript.fromBinary(out.script)) != null) {
        setStatus("Verifying edition against its collection\u2026");
        const r = await verifyEditionCovenant(tx, outputIndex, { getRawTransaction: (id) => provider.getSourceTransaction(id) });
        if (!r.valid) {
          setStatus(`\u274C ${r.reason}${r.collectionName ? ` \u2014 \u201C${r.collectionName}\u201D` : ""}`, "error");
          return;
        }
        const econ = `fees ${r.publisherFeeSats}/${r.holderFeeSats} sats`;
        let anchor = `TX1 ${short(r.collectionId ?? "")}`;
        try {
          const conf = await provider.getTxConfirmation(r.collectionId ?? "");
          anchor += conf != null ? ` \xB7 anchored at block ${conf.blockHeight.toLocaleString()} (${fmtUtc(conf.time * 1e3)})` : " \xB7 pending confirmation";
        } catch {
        }
        setStatus(`\u2705 ${r.reason}${r.collectionName ? ` \u2014 \u201C${r.collectionName}\u201D` : ""} \xB7 ${econ} (verified against ${anchor}).`, "ok");
        return;
      }
      const deps = { getRawTransaction: (id) => provider.getSourceTransaction(id) };
      const v = await verifyTokenLineage(tx, outputIndex, deps);
      let name = "";
      try {
        const tx1 = await provider.getSourceTransaction(v.collectionId ?? "");
        for (const o of tx1.outputs) {
          const tmpl = parseTemplateScript(LockingScript.fromBinary(o.script));
          if (tmpl) {
            name = tmpl.fields.tokenName;
            break;
          }
        }
      } catch {
      }
      setStatus(`${v.valid ? "\u2705" : "\u274C"} ${v.reason}${name ? ` \u2014 collection "${name}"` : ""}`, v.valid ? "ok" : "error");
    } catch (e) {
      setStatus(`Verify failed: ${e.message}`, "error");
    }
  }
  var viewerUrl = null;
  var CONTENT_DB = "pharlap2-content";
  var CONTENT_STORE = "content";
  var contentDbPromise = null;
  function openContentDb() {
    if (contentDbPromise != null) return contentDbPromise;
    contentDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(CONTENT_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(CONTENT_STORE)) db.createObjectStore(CONTENT_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return contentDbPromise;
  }
  async function cachedContentGet(key2) {
    const db = await openContentDb();
    if (db == null) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(CONTENT_STORE, "readonly").objectStore(CONTENT_STORE).get(key2);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  async function cachedContentPut(key2, value) {
    const db = await openContentDb();
    if (db == null) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CONTENT_STORE, "readwrite");
        tx.objectStore(CONTENT_STORE).put(value, key2);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  async function fetchCollectionContent(collectionId, memberName) {
    const content = await fetchCollectionRaw(collectionId);
    if (content == null || memberName == null || memberName === "") return content;
    const set = parseBmcSet(content.bytes);
    if (set == null) return content;
    const mem = bmcMember(set, memberName);
    if (mem == null) return content;
    return { mimeType: mem.mimeType, fileName: mem.file, bytes: mem.bytes, verified: content.verified, msg: `\u{1F4E6} BMC set member \u201C${mem.name}\u201D` };
  }
  async function fetchCollectionRaw(collectionId) {
    const hit = await cachedContentGet(collectionId);
    if (hit != null) return { mimeType: hit.mimeType, fileName: hit.fileName, bytes: Array.from(hit.bytes), verified: hit.verified, msg: hit.msg };
    const tx1 = await provider.getSourceTransaction(collectionId);
    let file = null;
    let template;
    for (const o of tx1.outputs) {
      const f = parseFileScript(LockingScript.fromBinary(o.script));
      if (f) file = f.fields;
      const t = parseTemplateScript(LockingScript.fromBinary(o.script));
      if (t) template = t.fields;
    }
    if (!file) {
      for (const o of tx1.outputs) {
        const leg = parseLegacyFileScript(LockingScript.fromBinary(o.script));
        if (leg == null) continue;
        const bytes2 = leg.fields.fileBytes;
        const msg2 = `\u{1F4DC} Legacy ${leg.marker} \u2014 original on-chain provenance mint (plaintext, unencrypted)`;
        void cachedContentPut(collectionId, { mimeType: leg.fields.mimeType, fileName: leg.fields.fileName, bytes: new Uint8Array(bytes2), verified: true, msg: msg2 });
        return { mimeType: leg.fields.mimeType, fileName: leg.fields.fileName, bytes: bytes2, verified: true, msg: msg2 };
      }
      return null;
    }
    const rules = template != null ? decodeTokenRules(template.tokenRules) : null;
    const encrypted = rules?.isEncrypted ?? false;
    const ciphertextOk = encrypted && template?.fileHash === hexOf(sha256Bytes(file.fileBytes));
    let bytes = file.fileBytes;
    if (encrypted) {
      if (template?.wrappedKey == null || template?.keySalt == null) throw new Error("encrypted collection is missing its wrapped key");
      const K = await unwrapContentKey(template.wrappedKey, template.keySalt);
      if (K == null) throw new Error("could not unwrap the content key");
      bytes = await decryptContent(bytes, K);
    }
    if (rules?.isCompressed) bytes = await decompress(bytes);
    const verified = encrypted ? ciphertextOk : template?.fileHash === hexOf(sha256Bytes(bytes));
    const msg = encrypted ? verified ? "\u{1F513} Decrypted \u2014 ciphertext matches the on-chain commitment \u2713" : "\u26A0 Decrypted, but the ciphertext hash does NOT match the collection!" : verified ? "\u2713 Verified exact replica \u2014 SHA-256 of the content matches the on-chain commitment (timestamped on mint)" : "\u26A0 File loaded, but its hash does NOT match the on-chain commitment!";
    if (verified) void cachedContentPut(collectionId, { mimeType: file.mimeType, fileName: file.fileName, bytes: new Uint8Array(bytes), verified, msg });
    return { mimeType: file.mimeType, fileName: file.fileName, bytes, verified, msg };
  }
  async function viewBmf(collectionId, name, manifest) {
    const bmf = parseBmf(manifest.bytes);
    if (bmf == null) {
      setStatus("This release is a Block Media manifest, but it is unreadable.", "error");
      return;
    }
    const distinctTx = new Set(bmf.scenes.filter((s) => s.tx != null).map((s) => s.tx)).size + (bmf.audio?.tx != null ? 1 : 0);
    setStatus(`Resolving ${distinctTx} on-chain component${distinctTx === 1 ? "" : "s"} for the video\u2026`);
    const tracks = [];
    let missing = 0;
    let audioName = bmf.audio?.name ?? "";
    if (bmf.audio?.tx != null) {
      let d = null;
      try {
        d = await fetchCollectionContent(bmf.audio.tx);
      } catch {
        d = null;
      }
      if (d != null) {
        audioName = bmf.audio.name || d.fileName;
        tracks.push({ name: audioName, mimeType: d.mimeType, bytes: d.bytes });
      } else missing++;
    }
    const refKey = (s) => `${s.tx ?? ""}::${s.name ?? ""}`;
    const nameForRef = /* @__PURE__ */ new Map();
    for (const s of bmf.scenes) {
      if (s.tx == null) continue;
      const key2 = refKey(s);
      if (nameForRef.has(key2)) continue;
      let d = null;
      try {
        d = await fetchCollectionContent(s.tx, s.name);
      } catch {
        d = null;
      }
      if (d == null) {
        missing++;
        nameForRef.set(key2, "");
        continue;
      }
      const nm = s.name || d.fileName || `scene-${nameForRef.size + 1}.webp`;
      tracks.push({ name: nm, mimeType: d.mimeType || "image/webp", bytes: d.bytes });
      nameForRef.set(key2, nm);
    }
    const cueLines = [];
    if (audioName) cueLines.push(`# audio: ${audioName}`);
    for (const s of bmf.scenes) {
      const nm = s.tx != null ? nameForRef.get(refKey(s)) : s.name;
      if (nm) cueLines.push(`[${fmtLrcTime(s.t)}]${nm}`);
    }
    tracks.push({ name: "video.cue", mimeType: "text/plain", bytes: Array.from(new TextEncoder().encode(cueLines.join("\n") + "\n")) });
    if (tracks.every((t) => /\.(cue|lrc)$/i.test(t.name))) {
      setStatus("None of the video\u2019s components could be resolved on-chain.", "error");
      return;
    }
    let epCover = null;
    try {
      epCover = (await loadCollection(collectionId)).cover;
    } catch {
    }
    const lic = bmf.license != null ? `${bmf.license}${bmf.attribution ? ` \u2014 attribute ${bmf.attribution}` : ""}` : "";
    const msg = (missing === 0 ? `\u2713 Block Media video resolved \u2014 ${nameForRef.size} scene component${nameForRef.size === 1 ? "" : "s"}${audioName ? " + audio" : ""} fetched from chain and sequenced` : `\u26A0 Block Media video: ${missing} component${missing === 1 ? "" : "s"} unavailable on-chain (played without them)`) + (lic ? ` \xB7 Reuse: ${lic}` : "");
    const subtitle = `Block Media video \xB7 ${bmf.scenes.length} cues${lic ? ` \xB7 ${lic}` : ""}`;
    showAlbumTracks(name, tracks, missing === 0 && manifest.verified, msg, subtitle, epCover);
    setStatus(msg, missing === 0 ? "ok" : "error");
  }
  async function onView(collectionId, collectionName) {
    setStatus("Loading the embedded file from the collection\u2026");
    try {
      const decoded = await fetchCollectionContent(collectionId);
      if (decoded == null) {
        setStatus(`"${collectionName}" has no embedded file.`, "info");
        return;
      }
      if (isBmf(decoded.mimeType, decoded.bytes)) {
        await viewBmf(collectionId, collectionName, decoded);
        return;
      }
      if (isManifest(decoded.mimeType, decoded.bytes)) {
        await viewReferenceManifest(collectionId, collectionName, decoded);
        return;
      }
      const bmcSet = parseBmcSet(decoded.bytes);
      if (bmcSet != null) {
        viewBmc(collectionName, decoded, bmcSet);
        setStatus(decoded.msg, decoded.verified ? "ok" : "error");
        return;
      }
      showFile(collectionName, { mimeType: decoded.mimeType, fileName: decoded.fileName, fileBytes: decoded.bytes }, decoded.verified, decoded.msg);
      setStatus(decoded.msg, decoded.verified ? "ok" : "error");
    } catch (e) {
      setStatus(`View failed: ${e.message}`, "error");
    }
  }
  async function viewReferenceManifest(collectionId, epName, manifest) {
    const refs = parseManifest(manifest.bytes);
    if (refs == null) {
      setStatus("This release references other works, but its manifest is unreadable.", "error");
      return;
    }
    setStatus(`Resolving ${refs.length} referenced ${refs.length === 1 ? "work" : "works"}\u2026`);
    const tracks = [];
    let missing = 0;
    for (const r of refs) {
      let decoded = null;
      try {
        decoded = await fetchCollectionContent(r.id);
      } catch {
        decoded = null;
      }
      if (decoded == null || hexOf(sha256Bytes(decoded.bytes)) !== r.hash) {
        missing++;
        continue;
      }
      const inner = isAlbum(decoded.mimeType, decoded.bytes) ? parseAlbum(decoded.bytes) : null;
      if (inner != null && inner.length > 0) for (const t of inner) tracks.push(t);
      else tracks.push({ name: r.name || decoded.fileName, mimeType: decoded.mimeType, bytes: decoded.bytes });
    }
    if (tracks.length === 0) {
      setStatus("None of the referenced works could be resolved on-chain.", "error");
      return;
    }
    let epCover = null;
    try {
      epCover = (await loadCollection(collectionId)).cover;
    } catch {
    }
    const ok = missing === 0 && manifest.verified;
    const msg = missing === 0 ? `\u2713 ${tracks.length} track${tracks.length === 1 ? "" : "s"} resolved from referenced mints \u2014 each hash-verified against the manifest` : `\u26A0 ${tracks.length} of ${refs.length} referenced works resolved (${missing} unavailable or hash-mismatched)`;
    showAlbumTracks(epName, tracks, ok, msg, `${tracks.length} track${tracks.length === 1 ? "" : "s"} \xB7 referenced`, epCover);
    setStatus(msg, missing === 0 ? "ok" : "error");
  }
  var albumUrls = [];
  var epTeardown = null;
  var epVizSpeaker = (() => {
    try {
      return localStorage.getItem("pharlap2:viz") === "speaker";
    } catch {
      return false;
    }
  })();
  function revokeAlbumUrls() {
    if (epTeardown) {
      try {
        epTeardown();
      } catch {
      }
      epTeardown = null;
    }
    for (const u of albumUrls) URL.revokeObjectURL(u);
    albumUrls = [];
  }
  function renderPlayer(host, srcTracks, fallbackCover) {
    if (srcTracks.length === 0) {
      host.textContent = "This release has no playable content.";
      return;
    }
    let fallbackArtUrl = null;
    if (fallbackCover != null && fallbackCover.bytes.length > 0) {
      fallbackArtUrl = URL.createObjectURL(new Blob([new Uint8Array(fallbackCover.bytes)], { type: fallbackCover.mimeType || "image/jpeg" }));
      albumUrls.push(fallbackArtUrl);
    }
    const stripExt = (n) => n.replace(/\.[^./\\]+$/, "");
    const baseName = (n) => stripExt(n).replace(/^.*[/\\]/, "").toLowerCase();
    const cueFiles = srcTracks.filter((t) => /\.(cue|lrc)$/i.test(t.name));
    const availNames = srcTracks.map((s) => s.name);
    const cueSceneNames = /* @__PURE__ */ new Set();
    const sceneUrlByName = /* @__PURE__ */ new Map();
    const sceneUrlFor = (name) => {
      const key2 = name.toLowerCase();
      let u = sceneUrlByName.get(key2);
      if (u == null) {
        const f = srcTracks.find((s) => s.name === name);
        u = URL.createObjectURL(new Blob([new Uint8Array(f.bytes)], { type: f.mimeType || "image/webp" }));
        albumUrls.push(u);
        sceneUrlByName.set(key2, u);
        cueSceneNames.add(key2);
      }
      return u;
    };
    const buildTimeline = (cueBytes) => {
      const resolved = resolveCue(new TextDecoder().decode(new Uint8Array(cueBytes)), availNames);
      return resolved == null ? null : { scenes: resolved.map((s) => ({ t: s.t, url: sceneUrlFor(s.name) })) };
    };
    const cueTimelines = cueFiles.map((c) => ({ base: baseName(c.name), tl: buildTimeline(c.bytes) })).filter((c) => c.tl != null);
    const tracks = srcTracks.map((t) => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(t.bytes)], { type: t.mimeType }));
      albumUrls.push(url);
      const isFlac = t.mimeType.includes("flac") || /\.flac$/i.test(t.name);
      const isMp3 = t.mimeType.includes("mpeg") || t.mimeType.includes("mp3") || /\.mp3$/i.test(t.name);
      const pics = isFlac ? parseFlacPictures(t.bytes) : isMp3 ? parseId3Pictures(t.bytes) : [];
      const picUrls = pics.map((p) => {
        const u = URL.createObjectURL(new Blob([new Uint8Array(p.data)], { type: p.mimeType || "image/jpeg" }));
        albumUrls.push(u);
        return { type: p.pictureType, url: u };
      });
      const pick = (types) => picUrls.filter((p) => types.includes(p.type)).map((p) => p.url);
      const allArt = picUrls.map((p) => p.url);
      const media = pick([6]), front = pick([3]);
      let discUrls = media.length > 0 ? media : front.length > 0 ? front : allArt;
      let coverUrls = allArt;
      if (discUrls.length === 0 && fallbackArtUrl != null) discUrls = [fallbackArtUrl];
      if (coverUrls.length === 0 && fallbackArtUrl != null) coverUrls = [fallbackArtUrl];
      const lyrics2 = parseLyrics(isFlac ? parseFlacLyrics(t.bytes) : isMp3 ? parseId3Lyrics(t.bytes) : null);
      return { name: t.name, mimeType: t.mimeType, url, discUrls, coverUrls, lyrics: lyrics2, timeline: null };
    });
    const probe = document.createElement("audio");
    const GOOD_EXT = /\.(mp3|m4a|aac|mp4|opus|ogg|oga|wav|wave|aif|aiff|flac|weba)$/i;
    const isAudioFile = (t) => t.mimeType.startsWith("audio/") || GOOD_EXT.test(t.name);
    const canPlayInBrowser = (t) => t.mimeType !== "" && t.mimeType !== "application/octet-stream" ? probe.canPlayType(t.mimeType) !== "" : GOOD_EXT.test(t.name);
    const audioTracks = tracks.filter((t) => isAudioFile(t) && canPlayInBrowser(t));
    for (const at of audioTracks) {
      const m = cueTimelines.find((c) => c.base === baseName(at.name)) ?? (cueTimelines.length === 1 ? cueTimelines[0] : void 0);
      at.timeline = m?.tl ?? null;
    }
    const isCueOrScene = (t) => /\.(cue|lrc)$/i.test(t.name) || cueSceneNames.has(t.name.toLowerCase());
    const otherTracks = tracks.filter((t) => !(isAudioFile(t) && canPlayInBrowser(t)) && !isCueOrScene(t));
    const stage = document.createElement("div");
    stage.className = "ep-stage";
    stage.innerHTML = '<div class="ep-orbs"><div class="ep-orb"></div><div class="ep-orb"></div><div class="ep-orb"></div></div><div class="ep-player"><button class="ep-art-toggle" type="button" aria-label="Toggle cover view" title="Cover / player view" hidden>\u{1F5BC}\uFE0F</button><button class="ep-lyrics-toggle" type="button" aria-label="Toggle lyrics" title="Lyrics" hidden>\u{1F4DD}</button><button class="ep-video-toggle" type="button" aria-label="Toggle music video" title="Music video" hidden>\u{1F3AC}</button><button class="ep-viz-toggle" type="button" aria-label="Visualization mode" title="Visualization: spinning disc \u2014 tap for speaker (no spin)">\u{1F4BF}</button><div class="ep-disc-container"><div class="ep-disc"></div><img class="ep-art" alt="cover art" /><div class="ep-visualizer-container"><canvas class="ep-visualizer" width="280" height="280"></canvas></div><img class="ep-scene" alt="" /><div class="ep-lyrics"><div class="ep-lyrics-scroll"></div></div></div><ul class="ep-song-list"></ul><div class="ep-now-playing"></div><div class="ep-progress-container"><div class="ep-progress-bar"></div></div><div class="ep-time-display"><span class="ep-cur">0:00</span><span class="ep-dur">0:00</span></div><div class="ep-controls"><button class="ep-control-btn ep-prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button><button class="ep-control-btn ep-play-btn" aria-label="Play / pause"><svg viewBox="0 0 24 24" class="ep-play-icon"><path d="M8 5v14l11-7z"/></svg></button><button class="ep-control-btn ep-next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button></div><div class="ep-volume-container"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg><input type="range" class="ep-volume-slider" min="0" max="1" step="0.01" value="0.7" aria-label="Volume"></div></div>';
    host.append(stage);
    const q = (sel) => stage.querySelector(sel);
    const songList = q(".ep-song-list");
    const disc = q(".ep-disc");
    const discContainer = q(".ep-disc-container");
    const vizToggle = q(".ep-viz-toggle");
    const nowPlaying = q(".ep-now-playing");
    const progressBar = q(".ep-progress-bar");
    const progressContainer = q(".ep-progress-container");
    const curEl = q(".ep-cur"), durEl = q(".ep-dur");
    const playIcon = q(".ep-play-icon");
    const canvas = q(".ep-visualizer");
    const cctx = canvas.getContext("2d");
    const orbs = Array.from(stage.querySelectorAll(".ep-orb"));
    const volume = q(".ep-volume-slider");
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = parseFloat(volume.value);
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let rafId = 0, isPlaying = false, current = 0, tornDown = false;
    let speakerScale = 1;
    const art = q(".ep-art");
    const player = q(".ep-player");
    const artToggle = q(".ep-art-toggle");
    let artTimer = 0;
    let curDisc = [], curCover = [];
    function runArtSlideshow(urls) {
      window.clearInterval(artTimer);
      if (urls.length === 0) {
        art.style.display = "none";
        art.style.opacity = "0";
        return;
      }
      let i = 0;
      art.style.display = "block";
      art.src = urls[0];
      art.style.opacity = "1";
      if (urls.length > 1) {
        artTimer = window.setInterval(() => {
          i = (i + 1) % urls.length;
          art.style.opacity = "0";
          window.setTimeout(() => {
            art.src = urls[i];
            art.style.opacity = "1";
          }, 400);
        }, 6e3);
      }
    }
    function showArt(disc2, cover) {
      curDisc = disc2;
      curCover = cover;
      const hasAny = disc2.length > 0 || cover.length > 0;
      player.classList.toggle("has-art", hasAny);
      if (!hasAny) {
        player.classList.remove("art-view");
        runArtSlideshow([]);
        return;
      }
      const inCover = player.classList.contains("art-view");
      runArtSlideshow(inCover ? cover.length > 0 ? cover : disc2 : disc2.length > 0 ? disc2 : cover);
    }
    artToggle.onclick = () => {
      const inCover = player.classList.toggle("art-view");
      artToggle.textContent = inCover ? "\u{1F4BF}" : "\u{1F5BC}\uFE0F";
      runArtSlideshow(inCover ? curCover.length > 0 ? curCover : curDisc : curDisc.length > 0 ? curDisc : curCover);
    };
    const applyViz = () => {
      player.classList.toggle("viz-speaker", epVizSpeaker);
      vizToggle.textContent = epVizSpeaker ? "\u{1F50A}" : "\u{1F4BF}";
      vizToggle.title = epVizSpeaker ? "Visualization: speaker \u2014 tap for spinning disc" : "Visualization: spinning disc \u2014 tap for speaker (no spin)";
      if (!epVizSpeaker) {
        discContainer.style.transform = "";
        speakerScale = 1;
      }
    };
    vizToggle.onclick = () => {
      epVizSpeaker = !epVizSpeaker;
      try {
        localStorage.setItem("pharlap2:viz", epVizSpeaker ? "speaker" : "disc");
      } catch {
      }
      applyViz();
    };
    applyViz();
    const lyricsToggle = q(".ep-lyrics-toggle");
    const lyricsScroll = q(".ep-lyrics-scroll");
    let lyrics = null;
    let lyricEls = [];
    let lastLyric = -1;
    function loadLyrics(parsed) {
      lyrics = parsed;
      lastLyric = -1;
      lyricEls = [];
      lyricsScroll.innerHTML = "";
      lyricsScroll.scrollTop = 0;
      if (parsed == null) {
        lyricsToggle.hidden = true;
        player.classList.remove("lyrics-view");
        return;
      }
      lyricsScroll.classList.toggle("ep-ly-synced", parsed.synced);
      for (const ln of parsed.lines) {
        const p = document.createElement("p");
        p.className = "ep-ly-line";
        p.textContent = ln.text !== "" ? ln.text : "\u266A";
        lyricsScroll.append(p);
        lyricEls.push(p);
      }
      lyricsToggle.hidden = false;
    }
    function syncLyrics() {
      if (lyrics == null || !lyrics.synced || lyricEls.length === 0) return;
      const ct = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < lyrics.lines.length; i++) {
        if (lyrics.lines[i].t <= ct) idx = i;
        else break;
      }
      if (idx === lastLyric) return;
      if (lastLyric >= 0 && lyricEls[lastLyric] != null) lyricEls[lastLyric].classList.remove("active");
      lastLyric = idx;
      if (idx < 0) return;
      const el = lyricEls[idx];
      el.classList.add("active");
      if (player.classList.contains("lyrics-view")) lyricsScroll.scrollTop = el.offsetTop - lyricsScroll.clientHeight / 2 + el.clientHeight / 2;
    }
    lyricsToggle.onclick = () => {
      const on = player.classList.toggle("lyrics-view");
      lyricsToggle.textContent = on ? "\u2716\uFE0F" : "\u{1F4DD}";
      if (on && lastLyric >= 0 && lyricEls[lastLyric] != null) lyricsScroll.scrollTop = lyricEls[lastLyric].offsetTop - lyricsScroll.clientHeight / 2;
    };
    const videoToggle = q(".ep-video-toggle");
    const scene = q(".ep-scene");
    scene.onload = () => {
      if (scene.naturalWidth > 0 && scene.naturalHeight > 0) player.style.setProperty("--ep-vid-ar", (scene.naturalWidth / scene.naturalHeight).toFixed(4));
    };
    let timeline = null;
    let lastScene = -1;
    function loadTimeline(tl) {
      timeline = tl;
      lastScene = -1;
      scene.removeAttribute("src");
      player.style.removeProperty("--ep-vid-ar");
      if (tl == null) {
        videoToggle.hidden = true;
        player.classList.remove("video-view");
        return;
      }
      videoToggle.hidden = false;
    }
    function syncScene() {
      if (timeline == null || timeline.scenes.length === 0) return;
      const ct = audio.currentTime;
      let idx = 0;
      for (let i = 0; i < timeline.scenes.length; i++) {
        if (timeline.scenes[i].t <= ct) idx = i;
        else break;
      }
      if (idx === lastScene) return;
      lastScene = idx;
      scene.src = timeline.scenes[idx].url;
    }
    videoToggle.onclick = () => {
      const on = player.classList.toggle("video-view");
      videoToggle.textContent = on ? "\u2716\uFE0F" : "\u{1F3AC}";
      if (on) {
        lastScene = -1;
        syncScene();
      }
    };
    let dlBox = null;
    const dlAdded = /* @__PURE__ */ new Set();
    const addDownload = (t, note) => {
      if (dlAdded.has(t.url)) return;
      dlAdded.add(t.url);
      if (dlBox == null) {
        dlBox = document.createElement("div");
        dlBox.className = "ep-downloads";
        const lbl = document.createElement("div");
        lbl.className = "ep-dl-label";
        lbl.textContent = "Downloads";
        dlBox.append(lbl);
        host.append(dlBox);
      }
      const a = document.createElement("a");
      a.href = t.url;
      a.download = t.name;
      a.className = "viewer-dl";
      a.textContent = `Download ${t.name}${note ? ` \u2014 ${note}` : ""}`;
      dlBox.append(a);
    };
    const fmt = (s) => Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";
    function initAudioContext() {
      if (audioCtx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaElementSource(audio).connect(analyser);
        analyser.connect(audioCtx.destination);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
      } catch {
      }
    }
    const updatePlayIcon = () => {
      playIcon.innerHTML = isPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    };
    function updateProgress() {
      if (audio.duration) progressBar.style.width = `${audio.currentTime / audio.duration * 100}%`;
      curEl.textContent = fmt(audio.currentTime);
      syncLyrics();
      syncScene();
    }
    function play(i) {
      if (audioTracks.length === 0) return;
      current = (i % audioTracks.length + audioTracks.length) % audioTracks.length;
      Array.from(songList.children).forEach((li, k) => li.classList.toggle("active", k === current));
      initAudioContext();
      void audioCtx?.resume();
      audio.src = audioTracks[current].url;
      showArt(audioTracks[current].discUrls, audioTracks[current].coverUrls);
      loadLyrics(audioTracks[current].lyrics);
      loadTimeline(audioTracks[current].timeline);
      nowPlaying.innerHTML = `Now playing: <span>${escapeHtml(stripExt(audioTracks[current].name))}</span>`;
      void audio.play().catch(() => {
        nowPlaying.textContent = "Tap a track to play";
      });
    }
    audioTracks.forEach((t, i) => {
      const li = document.createElement("li");
      li.textContent = stripExt(t.name);
      li.onclick = () => play(i);
      songList.append(li);
    });
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", () => {
      durEl.textContent = fmt(audio.duration);
    });
    audio.addEventListener("play", () => {
      isPlaying = true;
      disc.classList.add("playing");
      player.classList.add("playing");
      updatePlayIcon();
    });
    audio.addEventListener("pause", () => {
      isPlaying = false;
      disc.classList.remove("playing");
      player.classList.remove("playing");
      updatePlayIcon();
    });
    audio.addEventListener("ended", () => play(current + 1));
    audio.addEventListener("error", () => {
      if (tornDown || !audio.src) return;
      const t = audioTracks[current];
      if (t == null) return;
      nowPlaying.innerHTML = `<span>Can\u2019t play \u201C${escapeHtml(stripExt(t.name))}\u201D in this browser \u2014 download it below.</span>`;
      addDownload(t, "unsupported format");
    });
    q(".ep-prev").onclick = () => play(current - 1);
    q(".ep-next").onclick = () => play(current + 1);
    q(".ep-play-btn").onclick = () => {
      if (!audio.src) {
        play(0);
        return;
      }
      if (isPlaying) audio.pause();
      else {
        void audioCtx?.resume();
        void audio.play();
      }
    };
    progressContainer.onclick = (e) => {
      if (!audio.duration) return;
      const r = progressContainer.getBoundingClientRect();
      audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    };
    volume.oninput = () => {
      audio.volume = parseFloat(volume.value);
    };
    function frame() {
      rafId = requestAnimationFrame(frame);
      let bassNow = 0;
      if (analyser != null && isPlaying && dataArray != null) {
        analyser.getByteFrequencyData(dataArray);
        let bass = 0, mids = 0, highs = 0;
        for (let i = 0; i < 10; i++) bass += dataArray[i];
        for (let i = 10; i < 40; i++) mids += dataArray[i];
        for (let i = 40; i < 80; i++) highs += dataArray[i];
        bass /= 10 * 255;
        mids /= 30 * 255;
        highs /= 40 * 255;
        bassNow = bass;
        const t = Date.now();
        orbs[0].style.transform = `translate(${Math.sin(t / 1e3) * 30 * bass}px, ${Math.cos(t / 1200) * 30 * bass}px) scale(${1 + bass * 0.5})`;
        orbs[0].style.opacity = `${0.4 + bass * 0.4}`;
        orbs[1].style.transform = `translate(${Math.cos(t / 1100) * 40 * mids}px, ${Math.sin(t / 900) * 40 * mids}px) scale(${1 + mids * 0.4})`;
        orbs[1].style.opacity = `${0.4 + mids * 0.4}`;
        orbs[2].style.transform = `translate(calc(-50% + ${Math.sin(t / 800) * 50 * highs}px), calc(-50% + ${Math.cos(t / 1e3) * 50 * highs}px)) scale(${1 + highs * 0.3})`;
        orbs[2].style.opacity = `${0.4 + highs * 0.5}`;
      }
      if (player.classList.contains("viz-speaker") && !player.classList.contains("art-view") && !player.classList.contains("video-view")) {
        speakerScale += (1 + bassNow * 0.3 - speakerScale) * 0.35;
        discContainer.style.transform = `scale(${speakerScale.toFixed(3)})`;
      } else if (speakerScale !== 1) {
        speakerScale = 1;
        discContainer.style.transform = "";
      }
      cctx.clearRect(0, 0, canvas.width, canvas.height);
      if (analyser != null && isPlaying && dataArray != null) {
        const cx = canvas.width / 2, cy = canvas.height / 2, radius = 95, bars = 64;
        for (let i = 0; i < bars; i++) {
          const h = dataArray[i] / 255 * 42;
          const a = i / bars * Math.PI * 2 - Math.PI / 2;
          const x1 = cx + Math.cos(a) * radius, y1 = cy + Math.sin(a) * radius;
          const x2 = cx + Math.cos(a) * (radius + h), y2 = cy + Math.sin(a) * (radius + h);
          const g = cctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, "rgba(255,0,110,0.85)");
          g.addColorStop(0.5, "rgba(131,56,236,0.85)");
          g.addColorStop(1, "rgba(58,134,255,0.85)");
          cctx.beginPath();
          cctx.moveTo(x1, y1);
          cctx.lineTo(x2, y2);
          cctx.strokeStyle = g;
          cctx.lineWidth = 3;
          cctx.lineCap = "round";
          cctx.stroke();
        }
      }
    }
    frame();
    if (audioTracks.length > 0) {
      songList.children[0].classList.add("active");
      nowPlaying.textContent = "Tap a track to play";
      showArt(audioTracks[0].discUrls, audioTracks[0].coverUrls);
      loadLyrics(audioTracks[0].lyrics);
      loadTimeline(audioTracks[0].timeline);
    } else {
      nowPlaying.textContent = otherTracks.some(isAudioFile) ? "No in-browser-playable audio \u2014 see downloads below." : "This release has no playable audio.";
    }
    for (const t of otherTracks) addDownload(t, isAudioFile(t) ? "can\u2019t play in this browser" : void 0);
    epTeardown = () => {
      tornDown = true;
      cancelAnimationFrame(rafId);
      window.clearInterval(artTimer);
      try {
        audio.pause();
      } catch {
      }
      audio.src = "";
      try {
        void audioCtx?.close();
      } catch {
      }
    };
  }
  function showFile(title, file, verified, note) {
    const content = $("viewerContent");
    revokeAlbumUrls();
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
      viewerUrl = null;
    }
    viewerUrl = URL.createObjectURL(new Blob([new Uint8Array(file.fileBytes)], { type: file.mimeType }));
    $("viewerTitle").textContent = `${title} \u2014 ${file.fileName} \xB7 ${file.mimeType} \xB7 ${file.fileBytes.length} bytes`;
    const banner = $("viewerProvenance");
    if (note) {
      banner.textContent = note;
      banner.className = `viewer-banner ${verified ? "ok" : "error"}`;
      banner.style.display = "block";
    } else {
      banner.style.display = "none";
    }
    content.innerHTML = "";
    const albumTracks = isAlbum(file.mimeType, file.fileBytes) ? parseAlbum(file.fileBytes) : null;
    if (albumTracks != null) {
      renderPlayer(content, albumTracks);
    } else if (file.mimeType.startsWith("audio/")) {
      renderPlayer(content, [{ name: file.fileName, mimeType: file.mimeType, bytes: file.fileBytes }]);
    } else if (file.mimeType.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = viewerUrl;
      img.className = "viewer-img";
      content.append(img);
    } else if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
      const pre = document.createElement("pre");
      pre.className = "viewer-pre";
      pre.textContent = new TextDecoder().decode(new Uint8Array(file.fileBytes));
      content.append(pre);
    } else {
      const a = document.createElement("a");
      a.href = viewerUrl;
      a.download = file.fileName;
      a.textContent = `Download ${file.fileName}`;
      a.className = "viewer-dl";
      content.append(a);
    }
    $("viewer").style.display = "flex";
  }
  function viewBmc(title, content, set) {
    const el = $("viewerContent");
    revokeAlbumUrls();
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
      viewerUrl = null;
    }
    $("viewerTitle").textContent = `${title} \u2014 \u{1F4E6} BMC set \xB7 ${set.members.length} member${set.members.length === 1 ? "" : "s"} \xB7 ${kb(content.bytes.length)}`;
    const banner = $("viewerProvenance");
    banner.textContent = content.msg;
    banner.className = `viewer-banner ${content.verified ? "ok" : "error"}`;
    banner.style.display = "block";
    el.innerHTML = "";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-bottom:14px";
    for (const m of set.members) {
      const mime = (m.mimeType || "application/octet-stream").toLowerCase();
      const url = URL.createObjectURL(new Blob([new Uint8Array(m.bytes)], { type: mime }));
      albumUrls.push(url);
      const card2 = document.createElement("div");
      card2.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:10px;background:#0d1117";
      const label = document.createElement("div");
      label.style.cssText = "font-size:12px;font-weight:600;opacity:0.75;margin-bottom:8px;word-break:break-word";
      label.textContent = `${m.name} \xB7 ${mime} \xB7 ${kb(m.bytes.length)}`;
      card2.append(label);
      if (mime.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = url;
        img.className = "viewer-img";
        img.loading = "lazy";
        card2.append(img);
      } else if (mime.startsWith("audio/")) {
        const au = document.createElement("audio");
        au.src = url;
        au.controls = true;
        au.style.width = "100%";
        card2.append(au);
      } else if (mime.startsWith("video/")) {
        const v = document.createElement("video");
        v.src = url;
        v.className = "viewer-img";
        v.controls = true;
        v.loop = true;
        v.playsInline = true;
        card2.append(v);
      } else if (mime.startsWith("text/") || mime === "application/json") {
        const pre = document.createElement("pre");
        pre.className = "viewer-pre";
        pre.textContent = new TextDecoder().decode(new Uint8Array(m.bytes));
        card2.append(pre);
      }
      const dl = document.createElement("a");
      dl.href = url;
      dl.download = m.file;
      dl.textContent = `\u2B07 ${m.file}`;
      dl.className = "viewer-dl";
      dl.style.cssText = "display:inline-block;margin-top:8px;font-size:12px";
      card2.append(dl);
      grid.append(card2);
    }
    el.append(grid);
    const setUrl = URL.createObjectURL(new Blob([new Uint8Array(content.bytes)], { type: "application/octet-stream" }));
    albumUrls.push(setUrl);
    const setDl = document.createElement("a");
    setDl.href = setUrl;
    setDl.download = content.fileName || `${set.name}.bmc`;
    setDl.textContent = `\u2B07 Download the whole set (${content.fileName || `${set.name}.bmc`})`;
    setDl.className = "viewer-dl";
    el.append(setDl);
    $("viewer").style.display = "flex";
  }
  function showAlbumTracks(title, tracks, verified, note, subtitle, fallbackCover) {
    const content = $("viewerContent");
    revokeAlbumUrls();
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
      viewerUrl = null;
    }
    $("viewerTitle").textContent = `${title} \u2014 ${subtitle}`;
    const banner = $("viewerProvenance");
    if (note) {
      banner.textContent = note;
      banner.className = `viewer-banner ${verified ? "ok" : "error"}`;
      banner.style.display = "block";
    } else banner.style.display = "none";
    content.innerHTML = "";
    renderPlayer(content, tracks, fallbackCover);
    $("viewer").style.display = "flex";
  }
  function closeViewer() {
    $("viewer").style.display = "none";
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
      viewerUrl = null;
    }
    revokeAlbumUrls();
    $("viewerContent").innerHTML = "";
  }
  var CATS = [
    { key: "image", label: "Images", icon: "\u{1F5BC}\uFE0F" },
    { key: "audio", label: "Audio", icon: "\u{1F3B5}" },
    { key: "video", label: "Video", icon: "\u{1F3AC}" },
    { key: "document", label: "Documents", icon: "\u{1F4C4}" },
    { key: "text", label: "Text", icon: "\u{1F4DD}" },
    { key: "archive", label: "Archives", icon: "\u{1F5DC}\uFE0F" },
    { key: "other", label: "Other", icon: "\u{1F3B4}" }
  ];
  function mimeCategory(mime) {
    if (mime == null || mime === "") return "other";
    const m = mime.toLowerCase();
    if (m === ALBUM_MIME) return "audio";
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("audio/")) return "audio";
    if (m.startsWith("video/")) return "video";
    if (m.startsWith("text/")) return "text";
    if (m === "application/pdf" || m.includes("msword") || m.includes("officedocument") || m.includes("ms-excel") || m.includes("ms-powerpoint") || m.includes("opendocument") || m === "application/rtf" || m === "application/epub+zip") return "document";
    if (m === "application/json" || m === "application/xml" || m.endsWith("+xml")) return "text";
    if (m === "application/zip" || m === "application/gzip" || m === "application/x-tar" || m.includes("compressed") || m.includes("7z") || m.includes("rar") || m === "application/x-bzip2") return "archive";
    return "other";
  }
  function renderTokens(skipWarm = false) {
    const host = $("tokens");
    const active = [...store2.active()].sort((a, b) => {
      const ha = a.heightHint ?? Infinity;
      const hb = b.heightHint ?? Infinity;
      if (ha !== hb) return hb - ha;
      return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
    });
    if (active.length === 0) {
      host.innerHTML = '<p class="muted">No NFTs yet. Publish a collection or Check Incoming.</p>';
      return;
    }
    const myHash = myPubKeyHash();
    const groups = /* @__PURE__ */ new Map();
    for (const t of active) {
      const g = groups.get(t.collectionId);
      if (g != null) g.push(t);
      else groups.set(t.collectionId, [t]);
    }
    if (nftSort === "publisher") {
      renderTokensByPublisher(host, active, groups, myHash);
      return;
    }
    const buckets = /* @__PURE__ */ new Map();
    let anyPending = false;
    for (const [collectionId, copies] of groups) {
      const mime = cachedMime(collectionId);
      const cat = mime === void 0 ? skipWarm ? "other" : (anyPending = true, "pending") : mimeCategory(mime);
      const arr2 = buckets.get(cat);
      if (arr2 != null) arr2.push([collectionId, copies]);
      else buckets.set(cat, [[collectionId, copies]]);
    }
    host.innerHTML = `<p class="muted" style="font-size:12px;margin:0 0 8px">${active.length} held \u2014 newest first</p>`;
    const single = CATS.filter((c) => buckets.get(c.key)?.length).length <= 1 && !anyPending;
    for (const c of CATS) {
      const items = buckets.get(c.key);
      if (items == null || items.length === 0) continue;
      if (single) host.append(sectionBody(items, myHash));
      else host.append(sectionEl(`${c.icon} ${c.label}`, items, myHash));
    }
    const pending = buckets.get("pending");
    if (pending?.length) host.append(sectionEl("\u23F3 Identifying type\u2026", pending, myHash));
    if (anyPending) void warmAndRerender([...groups.keys()]);
    if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true));
  }
  function renderTokensByPublisher(host, active, groups, myHash) {
    const buckets = /* @__PURE__ */ new Map();
    for (const [collectionId, copies] of groups) {
      const t0 = copies[0];
      const k = t0.publisherPubKeyHashHex == null ? "none" : t0.publisherPubKeyHashHex === myHash ? "you" : t0.publisherPubKeyHex ?? "pending";
      const arr2 = buckets.get(k);
      if (arr2 != null) arr2.push([collectionId, copies]);
      else buckets.set(k, [[collectionId, copies]]);
    }
    const isPub = (k) => k !== "you" && k !== "pending" && k !== "none";
    const order = [...buckets.keys()].sort((a, b) => {
      const rank = (k) => k === "you" ? 0 : isPub(k) ? 1 : k === "pending" ? 2 : 3;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return isPub(a) ? displayName(a).name.localeCompare(displayName(b).name) : 0;
    });
    host.innerHTML = `<p class="muted" style="font-size:12px;margin:0 0 8px">${active.length} held \u2014 by publisher</p>`;
    for (const k of order) {
      const items = buckets.get(k);
      const label = k === "you" ? "\u{1F4E4} Published by you" : k === "pending" ? "\u23F3 Resolving publisher\u2026" : k === "none" ? "\u{1FA99} No publisher" : nameChip(k);
      host.append(sectionEl(label, items, myHash));
    }
    if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true));
  }
  function card(collectionId, copies, myHash) {
    return copies.length === 1 ? singleCard(copies[0], myHash) : groupCard(collectionId, copies, myHash);
  }
  function sectionBody(items, myHash) {
    const wrap = document.createElement("div");
    if (nftView === "grid") {
      wrap.className = "token-grid";
      for (const [cid, copies] of items) wrap.append(tileEl(cid, copies, myHash));
    } else {
      for (const [cid, copies] of items) wrap.append(card(cid, copies, myHash));
    }
    return wrap;
  }
  function sectionEl(label, items, myHash) {
    const sec = document.createElement("div");
    sec.className = "token-section";
    const head = document.createElement("div");
    head.className = "token-section-head";
    head.innerHTML = `<span class="chev">\u25BE</span> <span class="token-section-label">${label}</span> <span class="count">${items.length}</span>`;
    const bodyEl = sectionBody(items, myHash);
    bodyEl.classList.add("token-section-body");
    head.onclick = (e) => {
      if (e.target.closest(".copy-id, button") != null) return;
      bodyEl.hidden = !bodyEl.hidden;
      head.querySelector(".chev").textContent = bodyEl.hidden ? "\u25B8" : "\u25BE";
    };
    sec.append(head, bodyEl);
    return sec;
  }
  function tileEl(collectionId, copies, myHash) {
    const t0 = copies[0];
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "token-tile";
    const thumb = document.createElement("div");
    thumb.className = "token-tile-thumb";
    thumb.innerHTML = '<div class="token-thumb-ph">\u{1F3B4}</div>';
    void fillCardThumb(thumb, collectionId);
    const cap = document.createElement("div");
    cap.className = "token-tile-cap";
    cap.innerHTML = `<span class="token-tile-name">${escapeHtml(t0.collectionName ?? "Collection")}</span>${copies.length > 1 ? `<span class="count">\xD7${copies.length}</span>` : t0.kind === "edition" ? '<span class="count">edition</span>' : ""}`;
    tile.append(thumb, cap);
    tile.onclick = () => openTokenDetail(collectionId, copies, myHash);
    return tile;
  }
  function openTokenDetail(collectionId, copies, myHash) {
    const body = $("tokenModalBody");
    body.innerHTML = "";
    body.append(copies.length === 1 ? singleCard(copies[0], myHash) : groupCard(collectionId, copies, myHash, true));
    $("tokenModal").style.display = "flex";
  }
  function closeTokenModal() {
    $("tokenModal").style.display = "none";
    $("tokenModalBody").innerHTML = "";
  }
  function setNftView(v) {
    if (nftView === v) return;
    nftView = v;
    try {
      localStorage.setItem("p2:nftview", v);
    } catch {
    }
    updateViewToggle();
    renderTokens();
  }
  function setNftSort(s) {
    if (nftSort === s) return;
    nftSort = s;
    try {
      localStorage.setItem("p2:nftsort", s);
    } catch {
    }
    updateSortToggle();
    renderTokens();
  }
  function updateSortToggle() {
    $("btnSortRecent").classList.toggle("active", nftSort === "recent");
    $("btnSortPublisher").classList.toggle("active", nftSort === "publisher");
  }
  function updateViewToggle() {
    $("btnViewList").classList.toggle("active", nftView === "list");
    $("btnViewGrid").classList.toggle("active", nftView === "grid");
  }
  async function warmAndRerender(collectionIds) {
    await Promise.all(collectionIds.map(ensureCollectionMeta));
    renderTokens(true);
  }
  function tokenThumbEl(collectionId) {
    const thumb = document.createElement("div");
    thumb.className = "token-thumb";
    thumb.innerHTML = '<div class="token-thumb-ph">\u{1F3B4}</div>';
    void fillCardThumb(thumb, collectionId);
    return thumb;
  }
  function tokenExtrasHtml(t) {
    const stateText = t.stateData && t.stateData !== "00" ? safeUtf8(t.stateData) : "";
    const latest = latestBroadcast.get(t.collectionId);
    return `${stateText ? `<div class="state">state: ${escapeHtml(stateText)}</div>` : ""}${t.sellerNote ? `<div class="state" style="color:var(--accent2)">\u{1F4DD} ${escapeHtml(t.sellerNote)}</div>` : ""}${t.bonusValue ? t.bonusKind === "link" ? `<div class="state">\u{1F381} <a href="${escapeHtml(t.bonusValue)}" target="_blank" rel="noopener" class="bonus-claim">Claim your bonus \u2197</a></div>` : `<div class="state">\u{1F381} Bonus code: <span class="mono">${escapeHtml(t.bonusValue)}</span></div>` : ""}${latest ? `<div class="state" style="color:var(--accent)">\u{1F4E3} ${escapeHtml(latest.text)}</div>` : ""}`;
  }
  async function onPublishPreview(t) {
    const k = requireKey();
    if (k == null) return;
    const name = t.collectionName ?? "this collection";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/mpeg,.mp3";
    input.onchange = async () => {
      const clip = await readFile(input);
      if (!clip) return;
      const kb2 = Math.round(clip.bytes.length / 1024);
      if (clip.bytes.length > MAX_PREVIEW_BYTES) {
        setStatus(`Preview too large (${kb2} KB; max ${Math.round(MAX_PREVIEW_BYTES / 1024)} KB). Use a shorter or lower-bitrate mp3.`, "error");
        return;
      }
      if (!confirm(`Publish a ${kb2} KB preview clip for \u201C${name}\u201D?

It's posted on-chain (a small one-off fee) so anyone can listen before buying. Replaces any previous preview for this collection.`)) return;
      setStatus("Publishing preview clip\u2026");
      try {
        const txId = await publishPreview(provider, k, t.collectionId, { mimeType: clip.mimeType || "audio/mpeg", bytes: clip.bytes });
        setStatusHtml(`\u{1F3A7} Preview published \u2713 \u2014 <a href="https://whatsonchain.com/tx/${txId}" target="_blank" rel="noopener">${txId.slice(0, 16)}\u2026</a>`, "ok");
        toast("Preview clip published \u2713");
        console.info(`[preview] published ${txId} for ${t.collectionId}`);
      } catch (e) {
        setStatus(`Preview publish failed: ${e.message}`, "error");
      }
    };
    input.click();
  }
  function tokenActions(t, myHash) {
    const isEdition = t.kind === "edition";
    const iAmPublisher = t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex === myHash;
    const ro = isWatchOnly();
    const verify = document.createElement("button");
    verify.textContent = "Verify";
    verify.className = "secondary";
    verify.onclick = () => void onVerify(t.txId, t.outputIndex);
    const actions = document.createElement("div");
    actions.className = "actions";
    if (isEdition) {
      const view = document.createElement("button");
      view.textContent = "OPEN";
      view.className = "secondary";
      view.onclick = () => void onView(t.collectionId, t.collectionName ?? "Edition");
      const sales = document.createElement("button");
      sales.textContent = "Sales page";
      sales.className = "secondary";
      sales.onclick = () => onOpenSalesPage(t);
      if (!ro) {
        const replicate = document.createElement("button");
        replicate.textContent = "Replicate";
        replicate.onclick = () => void onReplicate(t);
        const xfer = document.createElement("button");
        xfer.textContent = "Transfer";
        xfer.className = "secondary";
        xfer.onclick = () => void onTransferEdition(t);
        actions.append(replicate, xfer);
      }
      actions.append(view, sales, verify);
      if (!ro && t.lockHex != null && editionSupportsBurn(hexBytes(t.lockHex))) {
        const burn = document.createElement("button");
        burn.textContent = "\u{1F525} Burn";
        burn.className = "secondary";
        burn.onclick = () => void onBurn(t);
        actions.append(burn);
      }
      if (!ro) {
        const gift = document.createElement("button");
        gift.textContent = "\u{1F381} Gift";
        gift.className = "secondary";
        gift.onclick = () => void onGiftCopies(t);
        const links = document.createElement("button");
        links.textContent = "\u{1F4E5} Gift links";
        links.className = "secondary";
        links.onclick = () => void onViewGiftLinks(t);
        const reclaim = document.createElement("button");
        reclaim.textContent = "\u267B Reclaim gifts";
        reclaim.className = "secondary";
        reclaim.onclick = () => void onReclaimGifts(t);
        const partner = document.createElement("button");
        partner.textContent = "\u{1F91D} Onboard partner";
        partner.className = "secondary";
        partner.onclick = () => void onOnboardPartner(t);
        actions.append(gift, links, reclaim, partner);
      }
      if (iAmPublisher) {
        if (!ro) {
          const bc = document.createElement("button");
          bc.textContent = "\u{1F4E3} Broadcast";
          bc.className = "secondary";
          bc.onclick = () => void onBroadcast(t);
          const prev = document.createElement("button");
          prev.textContent = "\u{1F3A7} Preview clip";
          prev.className = "secondary";
          prev.onclick = () => void onPublishPreview(t);
          actions.append(bc, prev);
        }
        const buyers = document.createElement("button");
        buyers.textContent = "\u{1F465} Buyers";
        buyers.className = "secondary";
        buyers.onclick = () => void onViewBuyers(t);
        actions.append(buyers);
      }
    } else {
      const view = document.createElement("button");
      view.textContent = "OPEN";
      view.className = "secondary";
      view.onclick = () => void onView(t.collectionId, t.collectionName ?? "Collection");
      if (!ro) {
        const send = document.createElement("button");
        send.textContent = "Send";
        send.onclick = () => void onSend(t.txId, t.outputIndex);
        actions.append(send);
      }
      actions.append(verify, view);
    }
    return actions;
  }
  function singleCard(t, myHash) {
    const card2 = document.createElement("div");
    card2.className = "token";
    const body = document.createElement("div");
    body.className = "token-body";
    const isEdition = t.kind === "edition";
    body.innerHTML = `
    <div class="token-name">${escapeHtml(t.collectionName ?? "Collection")}${isEdition ? ' <span class="badge">edition</span>' : ""}</div>
    <div class="mono token-ids">collection <span class="copy-id" data-copy="${t.collectionId}" title="${t.collectionId} \u2014 click to copy">${short(t.collectionId)}</span> \xB7 utxo <span class="copy-id" data-copy="${t.txId}" title="${t.txId} \u2014 click to copy">${short(t.txId)}</span>:${t.outputIndex}</div>
    ${tokenExtrasHtml(t)}`;
    const pubRow = publisherRowEl(t, myHash);
    if (pubRow != null) body.append(pubRow);
    body.append(tokenActions(t, myHash));
    card2.append(tokenThumbEl(t.collectionId), body);
    return card2;
  }
  function groupCard(collectionId, copies, myHash, startOpen = false) {
    const t0 = copies[0];
    const isEdition = t0.kind === "edition";
    const card2 = document.createElement("div");
    card2.className = "token token-group";
    if (startOpen) card2.classList.add("open");
    const head = document.createElement("div");
    head.className = "token-group-head";
    const headBody = document.createElement("div");
    headBody.className = "token-body";
    headBody.innerHTML = `
    <div class="token-name">${escapeHtml(t0.collectionName ?? "Collection")}${isEdition ? ' <span class="badge">edition</span>' : ""} <span class="count">\xD7${copies.length}</span></div>
    <div class="mono token-ids">collection <span class="copy-id" data-copy="${collectionId}" title="${collectionId} \u2014 click to copy">${short(collectionId)}</span> \xB7 ${copies.length} copies held</div>`;
    const pubRow = publisherRowEl(t0, myHash);
    if (pubRow != null) headBody.append(pubRow);
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = startOpen ? "\u25BE" : "\u25B8";
    head.append(tokenThumbEl(collectionId), headBody, chev);
    const items = document.createElement("div");
    items.className = "token-group-items";
    items.hidden = !startOpen;
    for (const t of copies) {
      const row = document.createElement("div");
      row.className = "token-copy";
      row.innerHTML = `<div class="mono token-ids">utxo <span class="copy-id" data-copy="${t.txId}" title="${t.txId} \u2014 click to copy">${short(t.txId)}</span>:${t.outputIndex}</div>${tokenExtrasHtml(t)}`;
      row.append(tokenActions(t, myHash));
      items.append(row);
    }
    head.onclick = (e) => {
      if (e.target.closest(".copy-id") != null) return;
      items.hidden = !items.hidden;
      chev.textContent = items.hidden ? "\u25B8" : "\u25BE";
      card2.classList.toggle("open", !items.hidden);
    };
    card2.append(head, items);
    return card2;
  }
  var metaInFlight = /* @__PURE__ */ new Map();
  async function fillCardThumb(thumbEl, collectionId) {
    const cached = cachedThumb(collectionId);
    const url = cached != null ? cached : (await ensureCollectionMeta(collectionId), cachedThumb(collectionId));
    if (url == null) return;
    const img = document.createElement("img");
    img.className = "token-thumb-img";
    img.loading = "lazy";
    img.src = url;
    thumbEl.innerHTML = "";
    thumbEl.append(img);
  }
  async function ensureCollectionMeta(collectionId) {
    if (thumbResolved(collectionId) && cachedMime(collectionId) !== void 0) return;
    let p = metaInFlight.get(collectionId);
    if (p == null) {
      p = fetchCollectionMeta(collectionId);
      metaInFlight.set(collectionId, p);
    }
    try {
      await p;
    } finally {
      metaInFlight.delete(collectionId);
    }
  }
  async function fetchCollectionMeta(collectionId) {
    try {
      const tx1 = await provider.getSourceTransaction(collectionId);
      let coverBytes;
      let coverMime = "application/octet-stream";
      let file = null;
      let template;
      for (const o of tx1.outputs) {
        const s = parseStorefrontScript(LockingScript.fromBinary(o.script));
        if (s?.fields.coverBytes?.length) {
          coverBytes = s.fields.coverBytes;
          coverMime = s.fields.coverMimeType ?? coverMime;
        }
        const f = parseFileScript(LockingScript.fromBinary(o.script));
        if (f) file = f.fields;
        const t = parseTemplateScript(LockingScript.fromBinary(o.script));
        if (t) template = t.fields;
      }
      cacheMime(collectionId, file?.mimeType ?? null);
      if (coverBytes?.length) {
        if (await makeThumb(collectionId, coverBytes, coverMime) != null) return;
      }
      const rules = template != null ? decodeTokenRules(template.tokenRules) : null;
      if (file != null && !rules?.isEncrypted && file.mimeType.startsWith("image/")) {
        let bytes = file.fileBytes;
        if (rules?.isCompressed) {
          try {
            bytes = await decompress(bytes);
          } catch {
          }
        }
        if (await makeThumb(collectionId, bytes, file.mimeType) != null) return;
      }
      cacheNoThumb(collectionId);
    } catch {
    }
  }
  function safeUtf8(hex) {
    try {
      return utf8Of(hexBytes(hex));
    } catch {
      return hex;
    }
  }
  function onCopyClick(e) {
    const el = e.target?.closest("[data-copy]");
    if (el == null) return;
    const value = el.dataset.copy ?? "";
    if (value === "") return;
    void navigator.clipboard?.writeText(value);
    toast("Copied to clipboard");
  }
  var toastTimer;
  function toast(message) {
    let el = document.getElementById("toast");
    if (el == null) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el?.classList.remove("show"), 1400);
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  var contacts = {};
  var contactsAt = {};
  var seenAliases = {};
  var pinned = {};
  function persist(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
    }
  }
  function loadAliases() {
    try {
      contacts = JSON.parse(localStorage.getItem("p2:contacts") ?? "{}");
    } catch {
      contacts = {};
    }
    try {
      contactsAt = JSON.parse(localStorage.getItem("p2:contactsAt") ?? "{}");
    } catch {
      contactsAt = {};
    }
    try {
      seenAliases = JSON.parse(localStorage.getItem("p2:aliases") ?? "{}");
    } catch {
      seenAliases = {};
    }
    try {
      pinned = JSON.parse(localStorage.getItem("p2:pinned") ?? "{}");
    } catch {
      pinned = {};
    }
    try {
      avatars = JSON.parse(localStorage.getItem("p2:avatars") ?? "{}");
    } catch {
      avatars = {};
    }
  }
  function getMyAlias() {
    try {
      return (localStorage.getItem("p2:myalias") ?? "").trim();
    } catch {
      return "";
    }
  }
  function setMyAlias(a) {
    try {
      localStorage.setItem("p2:myalias", a);
      localStorage.setItem("p2:myaliasAt", String(nowMs()));
    } catch {
    }
    markConfigDirty();
  }
  var nowMs = () => {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  };
  function touchContact(k) {
    contactsAt[k.toLowerCase()] = nowMs();
    persist("p2:contactsAt", contactsAt);
    markConfigDirty();
  }
  function markConfigDirty() {
    try {
      localStorage.setItem("p2:cfgDirty", String((parseInt(localStorage.getItem("p2:cfgDirty") ?? "0", 10) || 0) + 1));
    } catch {
    }
    updateCfgBackupNote();
  }
  function rememberAlias(pubKeyHex2, alias) {
    if (alias === "") return;
    const k = pubKeyHex2.toLowerCase();
    if (contacts[k] != null) {
      if (!pinned[k] && contacts[k] !== alias) {
        contacts[k] = alias;
        persist("p2:contacts", contacts);
        touchContact(k);
      }
      return;
    }
    if (seenAliases[k] === alias) return;
    seenAliases[k] = alias;
    persist("p2:aliases", seenAliases);
  }
  function applyLatestAliases(items) {
    const latest = /* @__PURE__ */ new Map();
    for (const it of items) {
      const k = it.pk.toLowerCase();
      if (it.alias != null && it.alias !== "" && !latest.has(k)) latest.set(k, it.alias);
    }
    for (const [pk, alias] of latest) rememberAlias(pk, alias);
  }
  function saveContact(pubKeyHex2, alias, customLabel = false) {
    const k = pubKeyHex2.toLowerCase();
    contacts[k] = alias;
    if (customLabel) pinned[k] = 1;
    else delete pinned[k];
    delete seenAliases[k];
    persist("p2:contacts", contacts);
    persist("p2:pinned", pinned);
    persist("p2:aliases", seenAliases);
    touchContact(k);
  }
  function removeContact(pubKeyHex2) {
    const k = pubKeyHex2.toLowerCase();
    delete contacts[k];
    delete pinned[k];
    persist("p2:contacts", contacts);
    persist("p2:pinned", pinned);
    touchContact(k);
  }
  function ignoreSeen(pubKeyHex2) {
    delete seenAliases[pubKeyHex2.toLowerCase()];
    try {
      localStorage.setItem("p2:aliases", JSON.stringify(seenAliases));
    } catch {
    }
  }
  function refreshNameSurfaces() {
    renderInbox(lastInbox);
    if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed);
    renderTokens();
    updateMsgToName();
  }
  function displayName(pubKeyHex2) {
    const k = pubKeyHex2.toLowerCase();
    if (k === myPubKeyLc()) {
      const a = getMyAlias();
      return a ? { name: "@" + a, verified: true, isMe: true, alias: a } : { name: short(pubKeyHex2), verified: true, isMe: true };
    }
    if (contacts[k] != null) return { name: "@" + contacts[k], verified: true, isMe: false, alias: contacts[k] };
    if (seenAliases[k] != null) return { name: "@" + seenAliases[k], verified: false, isMe: false, alias: seenAliases[k] };
    return { name: short(pubKeyHex2), verified: true, isMe: false };
  }
  function myPubKeyLc() {
    try {
      return pubKeyHex.toLowerCase();
    } catch {
      return "";
    }
  }
  function keyHue(pubKeyHex2) {
    const h = sha256Bytes(hexBytes(pubKeyHex2.toLowerCase()));
    return (h[0] << 8 | h[1]) % 360;
  }
  function identiconSvg(pubKeyHex2, px = 18) {
    const h = sha256Bytes(hexBytes(pubKeyHex2.toLowerCase()));
    const hue = keyHue(pubKeyHex2);
    const fg = `hsl(${hue},62%,58%)`;
    const bg = `hsl(${hue},22%,20%)`;
    const N2 = 5;
    let cells = "";
    for (let y = 0; y < N2; y++) {
      for (let x = 0; x < 3; x++) {
        if ((h[2 + y * 3 + x] & 1) === 0) continue;
        cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        if (x < 2) cells += `<rect x="${N2 - 1 - x}" y="${y}" width="1" height="1"/>`;
      }
    }
    return `<svg class="identicon" width="${px}" height="${px}" viewBox="0 0 ${N2} ${N2}" aria-hidden="true"><rect width="${N2}" height="${N2}" fill="${bg}"/><g fill="${fg}">${cells}</g></svg>`;
  }
  var NO_AVATAR = "-";
  var avatars = {};
  function cachedAvatar(pubKeyHex2) {
    const a = avatars[pubKeyHex2.toLowerCase()];
    return a != null && a !== NO_AVATAR ? a : null;
  }
  function setAvatar(pubKeyHex2, value) {
    avatars[pubKeyHex2.toLowerCase()] = value;
    try {
      localStorage.setItem("p2:avatars", JSON.stringify(avatars));
    } catch {
    }
  }
  function avatarHtml(pubKeyHex2, px = 18) {
    const a = cachedAvatar(pubKeyHex2);
    if (a == null) return identiconSvg(pubKeyHex2, px);
    return `<img class="avatar identicon" src="${a}" width="${px}" height="${px}" alt="" style="border:1.5px solid hsl(${keyHue(pubKeyHex2)},62%,58%)" />`;
  }
  function nameChip(pubKeyHex2, opts = {}) {
    const info = displayName(pubKeyHex2);
    const ico = avatarHtml(pubKeyHex2);
    const chip = `<span class="copy-id" data-copy="${pubKeyHex2}" title="${pubKeyHex2} \u2014 click to copy">${escapeHtml(info.name)}</span>`;
    if (info.verified) return ico + chip;
    const warn = ` <span class="unverified" title="Self-claimed name \u2014 verify the key on hover before trusting it">\u26A0 unverified</span>`;
    const save = opts.save ? ` <button class="alias-save" data-pk="${pubKeyHex2}" data-alias="${escapeHtml(info.alias ?? "")}">save</button>` : "";
    return ico + chip + warn + save;
  }
  function bytesToDataUrl(mime, bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.slice(i, i + 32768));
    return `data:${mime || "image/webp"};base64,${btoa(bin)}`;
  }
  var avatarInFlight = /* @__PURE__ */ new Map();
  var profileChecked = /* @__PURE__ */ new Set();
  async function ensureAvatar(pubKeyHex2) {
    const k = pubKeyHex2.toLowerCase();
    if (profileChecked.has(k)) return false;
    profileChecked.add(k);
    let p = avatarInFlight.get(k);
    if (p == null) {
      p = fetchProfileInto(k);
      avatarInFlight.set(k, p);
    }
    try {
      return await p;
    } finally {
      avatarInFlight.delete(k);
    }
  }
  async function fetchProfileInto(k) {
    try {
      const prof = await resolveProfile(provider, k);
      const newAvatar = prof?.avatarBytes != null && prof.avatarBytes.length > 0 ? bytesToDataUrl(prof.avatarMimeType ?? "image/webp", prof.avatarBytes) : NO_AVATAR;
      const avatarChanged = avatars[k] !== newAvatar && newAvatar !== NO_AVATAR;
      setAvatar(k, newAvatar);
      let aliasChanged = false;
      if (prof?.alias != null && prof.alias !== "" && contacts[k] == null && seenAliases[k] == null) {
        seenAliases[k] = prof.alias;
        persist("p2:aliases", seenAliases);
        aliasChanged = true;
      }
      return avatarChanged || aliasChanged;
    } catch {
      return false;
    }
  }
  function resolveAvatarsThen(pubKeys, rerender) {
    const todo = [...new Set(pubKeys.map((p) => p.toLowerCase()))].filter((k) => !profileChecked.has(k));
    if (todo.length === 0) return;
    void Promise.all(todo.map(ensureAvatar)).then((changed) => {
      if (changed.some(Boolean)) rerender();
    });
  }
  var publisherKeyInFlight = /* @__PURE__ */ new Map();
  function myPubKeyHash() {
    return hexOf(hash160Bytes(hexBytes(pubKeyHex)));
  }
  async function recoverPublisherKey(collectionId, publisherHashHex) {
    try {
      const tx1 = await provider.getSourceTransaction(collectionId);
      for (const input of tx1.inputs) {
        for (const c of Script.fromBinary(input.script).chunks) {
          const d = c.data;
          if (d != null && (d.length === 33 || d.length === 65) && hexOf(hash160Bytes(d)) === publisherHashHex) {
            const hex = hexOf(d);
            store2.setPublisherPubKey(collectionId, hex);
            return hex;
          }
        }
      }
    } catch {
    }
    return null;
  }
  function resolvePublisherKey(t) {
    if (t.publisherPubKeyHex != null) return Promise.resolve(t.publisherPubKeyHex);
    if (t.publisherPubKeyHashHex == null) return Promise.resolve(null);
    let p = publisherKeyInFlight.get(t.collectionId);
    if (p == null) {
      p = recoverPublisherKey(t.collectionId, t.publisherPubKeyHashHex);
      publisherKeyInFlight.set(t.collectionId, p);
    }
    return p;
  }
  function resolvePublisherIdentitiesThen(tokens, rerender) {
    const mine = myPubKeyHash();
    const seen = /* @__PURE__ */ new Set();
    const todo = tokens.filter((t) => t.publisherPubKeyHex == null && t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex !== mine && !seen.has(t.collectionId) && (seen.add(t.collectionId), true));
    const known = tokens.map((t) => t.publisherPubKeyHex).filter((v) => v != null);
    if (known.length) resolveAvatarsThen(known, rerender);
    if (todo.length === 0) return;
    void Promise.all(todo.map(resolvePublisherKey)).then((keys) => {
      const got = keys.filter((v) => v != null);
      if (got.length === 0) return;
      resolveAvatarsThen(got, rerender);
      rerender();
    });
  }
  function fillWildcards(text, recipientKey, ctx) {
    const mine = getMyAlias();
    const recip = displayName(recipientKey).alias;
    const buyer = ctx.recipientRole === "buyer" ? recip ?? "there" : mine || "there";
    const publisher = ctx.recipientRole === "publisher" ? recip ?? "the publisher" : mine || "the publisher";
    return text.split("%buyer%").join(buyer).split("%publisher%").join(publisher).split("%product%").join(ctx.product ?? "");
  }
  function openCompose(recipients, opts) {
    if (recipients.length === 0) return;
    const multi = recipients.length > 1;
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `<div class="modal-box compose-box"><div class="modal-head"><span>\u2709 Message ${escapeHtml(opts.who)}</span><button class="secondary compose-close">\u2715 Close</button></div><div class="compose-to${multi ? " compose-many" : ""}">${recipients.map((r) => nameChip(r)).join(multi ? " " : "")}</div><textarea class="compose-text" rows="4" placeholder="Write a message\u2026"></textarea><p class="compose-hint muted" style="font-size:11px">Personalize with <code>%buyer%</code> \xB7 <code>%publisher%</code>${opts.product != null ? " \xB7 <code>%product%</code>" : ""}</p><div class="compose-preview muted" style="font-size:11px"></div><label class="compose-row"><span>\u{1F4CE} Attach a file</span> <input type="file" class="compose-file" /></label><label class="compose-row"><span><input type="checkbox" class="compose-encrypt" checked /> Encrypt</span> <span class="muted" style="font-size:11px">only they can read it</span></label><div class="row" style="margin-top:10px"><button class="compose-send">${multi ? `Send to ${recipients.length}` : "Send"}</button></div><p class="compose-status muted" style="font-size:12px;margin-top:8px"></p></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".compose-close")?.addEventListener("click", close);
    const textEl = overlay.querySelector(".compose-text");
    const fileEl = overlay.querySelector(".compose-file");
    const encEl = overlay.querySelector(".compose-encrypt");
    const sendBtn = overlay.querySelector(".compose-send");
    const statusEl = overlay.querySelector(".compose-status");
    const previewEl = overlay.querySelector(".compose-preview");
    const updatePreview = () => {
      const filled = fillWildcards(textEl.value, recipients[0], opts);
      previewEl.textContent = filled !== textEl.value ? `Preview \u2192 ${displayName(recipients[0]).name}: ${filled}` : "";
    };
    textEl.addEventListener("input", updatePreview);
    sendBtn.onclick = () => void (async () => {
      const k = requireKey();
      if (k == null) return;
      const text = textEl.value;
      const file = await readFile(fileEl);
      if (!text.trim() && file == null) {
        statusEl.textContent = "Write a message or attach a file first.";
        return;
      }
      if (multi && !confirm(
        `Send this message to ${recipients.length} recipients?

That's ${recipients.length} separate encrypted transactions \u2014 one network fee each${file != null ? " (the file is sent to each)" : ""}. Proceed?`
      )) return;
      sendBtn.disabled = true;
      let ok = 0, failed = 0;
      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        statusEl.textContent = multi ? `Sending ${i + 1}/${recipients.length}\u2026` : "Sending\u2026";
        const parts = [];
        const filled = fillWildcards(text, r, opts);
        if (filled.trim()) parts.push({ kind: "text", text: filled });
        if (file) parts.push({ kind: "file", mimeType: file.mimeType, fileName: file.fileName, bytes: file.bytes });
        if (parts.length === 0) continue;
        try {
          await sendMessage(provider, k, { toPubKeyHex: r, parts, encrypt: encEl.checked, senderAlias: getMyAlias() });
          ok++;
        } catch {
          failed++;
        }
      }
      statusEl.textContent = failed === 0 ? `\u2705 Sent${multi ? ` to ${ok}` : ""}.` : `Sent ${ok}, ${failed} failed${multi ? " \u2014 close and retry the rest" : ""}.`;
      if (failed === 0) setTimeout(close, multi ? 1600 : 1200);
      else sendBtn.disabled = false;
    })();
    document.body.append(overlay);
    textEl.focus();
  }
  function composeTo(pubKeyHex2, who, ctx) {
    openCompose([pubKeyHex2], { who, ...ctx });
  }
  function onMessagePublisher(pubKeyHex2, product) {
    composeTo(pubKeyHex2, "the publisher", { product, recipientRole: "publisher" });
  }
  function publisherRowEl(t, myHash) {
    if (t.publisherPubKeyHashHex == null) return null;
    const row = document.createElement("div");
    row.className = "token-publisher";
    if (t.publisherPubKeyHashHex === myHash) {
      row.innerHTML = '<span class="muted">\u{1F4E4} published by you</span>';
      return row;
    }
    const pk = t.publisherPubKeyHex;
    if (pk == null) {
      row.innerHTML = '<span class="muted">by publisher\u2026</span>';
      return row;
    }
    row.innerHTML = `<span class="muted">by</span> ${nameChip(pk)} `;
    const msg = document.createElement("button");
    msg.className = "link-btn";
    msg.textContent = "\u2709 Message";
    msg.onclick = (e) => {
      e.stopPropagation();
      onMessagePublisher(pk, t.collectionName);
    };
    row.append(msg);
    return row;
  }
  function onAliasSaveClick(e) {
    const btn = e.target?.closest(".alias-save");
    if (btn == null) return;
    const pk = btn.dataset.pk ?? "";
    const alias = btn.dataset.alias ?? "";
    if (pk === "") return;
    saveContact(pk, alias);
    toast(`Saved @${alias}`);
    renderInbox(lastInbox);
    if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed);
    updateMsgToName();
  }
  function updateMsgToName() {
    const to = val("msgTo");
    const el = $("msgToName");
    if (to.length !== 66 && to.length !== 130) {
      el.innerHTML = "";
      return;
    }
    const info = displayName(to);
    el.innerHTML = info.isMe ? "\u21AA that\u2019s your own key" : info.alias != null ? `\u2192 ${nameChip(to, { save: true })}` : "";
  }
  function cfgDirtyCount() {
    try {
      return parseInt(localStorage.getItem("p2:cfgDirty") ?? "0", 10) || 0;
    } catch {
      return 0;
    }
  }
  function lastBackupAt() {
    try {
      return parseInt(localStorage.getItem("p2:cfgBackupAt") ?? "0", 10) || 0;
    } catch {
      return 0;
    }
  }
  function updateCfgBackupNote() {
    const el = document.getElementById("cfgBackupNote");
    if (el == null) return;
    const n = cfgDirtyCount();
    const at = lastBackupAt();
    el.textContent = at === 0 ? Object.keys(contacts).length ? "Not backed up yet." : "Nothing to back up yet." : n > 0 ? `\u26A0 ${n} change${n > 1 ? "s" : ""} since last backup (${fmtTime(at)}).` : `\u2713 Backed up ${fmtTime(at)}.`;
  }
  async function onConfigBackup() {
    const myKey = requireKey();
    if (myKey == null) return;
    const btn = $("btnCfgBackup");
    btn.disabled = true;
    setStatus("Backing up your config (encrypted to your key)\u2026");
    try {
      let prefs = {};
      try {
        for (const k of ["p2:nftview", "p2:nftsort", "p2:refBy", "p2:affRefCode"]) {
          const v = localStorage.getItem(k);
          if (v != null) prefs[k] = v;
        }
      } catch {
        prefs = {};
      }
      const aliasAt = (() => {
        try {
          return parseInt(localStorage.getItem("p2:myaliasAt") ?? "0", 10) || 0;
        } catch {
          return 0;
        }
      })();
      const txId = await publishConfigBackup(
        provider,
        myKey,
        { alias: getMyAlias() || void 0, aliasAt, contacts, contactsAt, prefs },
        nowMs()
      );
      try {
        localStorage.setItem("p2:cfgBackupAt", String(nowMs()));
        localStorage.setItem("p2:cfgDirty", "0");
      } catch {
      }
      updateCfgBackupNote();
      setStatusHtml(`\u2601 Config backed up (encrypted). Tx ${idChip(txId)}.`, "ok");
    } catch (e) {
      setStatus(`Backup failed: ${e.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  }
  async function restoreConfigFromChain(quiet = false) {
    const myKey = requireKey();
    if (myKey == null) return 0;
    const blob = await resolveConfigBackup(provider, myKey);
    if (blob == null) {
      if (!quiet) setStatus("No config backup found for this key.");
      return 0;
    }
    const aliasAt = (() => {
      try {
        return parseInt(localStorage.getItem("p2:myaliasAt") ?? "0", 10) || 0;
      } catch {
        return 0;
      }
    })();
    const merged = mergeConfig({ alias: getMyAlias() || void 0, aliasAt, contacts, contactsAt }, blob);
    contacts = merged.contacts;
    contactsAt = merged.contactsAt;
    persist("p2:contacts", contacts);
    persist("p2:contactsAt", contactsAt);
    if (merged.alias != null && merged.alias !== getMyAlias()) {
      try {
        localStorage.setItem("p2:myalias", merged.alias);
        if (merged.aliasAt != null) localStorage.setItem("p2:myaliasAt", String(merged.aliasAt));
      } catch {
      }
      const ai = document.getElementById("myAlias");
      if (ai != null) ai.value = merged.alias ? "@" + merged.alias : "";
    }
    if (blob.prefs != null) {
      try {
        for (const [k, v] of Object.entries(blob.prefs)) localStorage.setItem(k, v);
      } catch {
      }
    }
    return merged.changed;
  }
  async function onConfigRestore() {
    const btn = $("btnCfgRestore");
    btn.disabled = true;
    setStatus("Looking for your config backup\u2026");
    try {
      const changed = await restoreConfigFromChain();
      if (changed >= 0) {
        renderContacts();
        updateCfgBackupNote();
        refreshNameSurfaces();
      }
      if (changed > 0) setStatus(`\u2913 Restored \u2014 ${changed} contact${changed > 1 ? "s" : ""} added/updated from your backup.`, "ok");
      else setStatus("Config restore: nothing new to merge (already up to date).", "ok");
    } catch (e) {
      setStatus(`Restore failed: ${e.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  }
  function openContactsModal() {
    renderContacts();
    updateCfgBackupNote();
    resolveAvatarsThen([...Object.keys(contacts), ...Object.keys(seenAliases)], renderContacts);
    $("contactsModal").style.display = "flex";
  }
  function closeContactsModal() {
    $("contactsModal").style.display = "none";
  }
  function renderContacts() {
    const host = $("contactsBody");
    host.innerHTML = "";
    const byName = (a, b) => a[1].localeCompare(b[1]);
    const saved = Object.entries(contacts).sort(byName);
    const seen = Object.entries(seenAliases).sort(byName);
    host.append(contactsSection(`Saved (${saved.length})`, saved, "saved", "No saved contacts yet \u2014 save senders from your inbox, or add one above."));
    host.append(contactsSection(`Seen, not saved (${seen.length})`, seen, "seen", "No unsaved names seen yet."));
  }
  function contactsSection(title, rows, kind, empty) {
    const sec = document.createElement("div");
    sec.className = "token-section";
    const head = document.createElement("div");
    head.className = "token-section-head";
    head.style.cursor = "default";
    head.innerHTML = `<span class="token-section-label">${title}</span>`;
    sec.append(head);
    if (rows.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.style.fontSize = "12px";
      p.textContent = empty;
      sec.append(p);
      return sec;
    }
    for (const [pk, alias] of rows) sec.append(contactRow(pk, alias, kind));
    return sec;
  }
  function contactRow(pk, alias, kind) {
    const row = document.createElement("div");
    row.className = "contact-row";
    row.innerHTML = `${avatarHtml(pk, 24)} <span class="contact-name">@${escapeHtml(alias)}</span> <span class="copy-id" data-copy="${pk}" title="${pk} \u2014 click to copy">${short(pk)}</span>`;
    const acts = document.createElement("span");
    acts.className = "contact-acts";
    const mkBtn = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.className = "secondary";
      b.onclick = fn;
      return b;
    };
    if (kind === "saved") {
      acts.append(
        mkBtn("Rename", () => {
          const n = prompt("New name for this contact:", alias);
          if (n == null) return;
          const nm = n.replace(/^@+/, "").trim();
          if (nm) {
            saveContact(pk, nm, true);
            renderContacts();
            refreshNameSurfaces();
          }
        }),
        mkBtn("Remove", () => {
          removeContact(pk);
          renderContacts();
          refreshNameSurfaces();
        })
      );
    } else {
      acts.append(
        mkBtn("Save", () => {
          saveContact(pk, alias);
          renderContacts();
          refreshNameSurfaces();
        }),
        mkBtn("Ignore", () => {
          ignoreSeen(pk);
          renderContacts();
        })
      );
    }
    row.append(acts);
    return row;
  }
  function onAddContact() {
    const pk = val("contactPk").toLowerCase();
    const name = val("contactName").replace(/^@+/, "").trim();
    if (pk.length !== 66 && pk.length !== 130) {
      toast("Enter a valid pubkey (66 or 130 hex chars)");
      return;
    }
    if (!/^[0-9a-f]+$/.test(pk)) {
      toast("Pubkey must be hex");
      return;
    }
    if (name === "") {
      toast("Enter a name for this contact");
      return;
    }
    saveContact(pk, name, true);
    $("contactPk").value = "";
    $("contactName").value = "";
    renderContacts();
    refreshNameSurfaces();
    toast(`Saved @${name}`);
  }
  var cvObjectUrl = null;
  var cvBackObjectUrl = null;
  var cvPreviewObjectUrl = null;
  var currentCollection = null;
  var cvNote = null;
  var cvNoteRefreshId = null;
  var NFTSALE_ORIGIN = "https://nft.sale";
  var cvGiftWif = null;
  function setCvStatus(msg, kind = "info") {
    const el = $("cvStatus");
    el.textContent = msg;
    el.className = `cv-status ${kind === "info" ? "" : kind}`.trim();
  }
  function cvGetButtons() {
    return ["cvGet", "cvGetTop"].map((id) => document.getElementById(id)).filter(Boolean);
  }
  function setCvGetLabel(text) {
    for (const b of cvGetButtons()) b.textContent = text;
  }
  function setCvGetDisabled(disabled) {
    for (const b of cvGetButtons()) b.disabled = disabled;
  }
  function reflectCvOwnership(info) {
    const buyable = info.fees != null;
    const another = document.getElementById("cvBuyAnother");
    if (cvGiftWif) {
      setCvGetDisabled(!buyable);
      if (another) another.style.display = "none";
      return;
    }
    const owns = store2.active().some((t) => t.collectionId === info.tx1Ref);
    if (owns && buyable) {
      for (const b of cvGetButtons()) {
        b.disabled = true;
        b.textContent = "\u2713 You own a copy";
        b.classList.add("owned");
      }
      if (another) another.style.display = "";
    } else {
      for (const b of cvGetButtons()) {
        b.disabled = !buyable;
        b.textContent = "Get a copy";
        b.classList.remove("owned");
      }
      if (another) another.style.display = "none";
    }
  }
  function parseHashRoute() {
    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const aff = params.get("aff");
    if (aff != null && aff !== "") incomingAff = aff;
    const c = params.get("c");
    if (!c) return null;
    return { c, h: params.get("h"), g: params.get("g"), src: params.get("src") };
  }
  async function loadCollection(tx1Ref, holderPubKeyHint, opts = {}) {
    let template;
    let publisherPubKeyHex = null;
    let storefront = null;
    let hasContentFile = false;
    let contentMime = null;
    for (let i = 0; i < (opts.light ? 1 : 6); i++) {
      let hex;
      try {
        hex = await provider.getOutputScriptHexCapped(tx1Ref, i, 8 * 1024 * 1024);
      } catch {
        hex = null;
      }
      if (hex == null) {
        if (template != null) break;
        continue;
      }
      if (hex === "oversized") {
        hasContentFile = true;
        continue;
      }
      const script = LockingScript.fromHex(hex);
      const t = parseTemplateScript(script);
      if (t) {
        template = t.fields;
        publisherPubKeyHex = t.publisherPubKeyHex;
      }
      const s = parseStorefrontScript(script);
      if (s) storefront = s.fields;
      const ff = parseFileScript(script);
      if (ff) {
        hasContentFile = true;
        contentMime = ff.fields.mimeType;
      }
      if (template != null && storefront != null) break;
    }
    if (!template) throw new Error("not a SMART NFTs collection (no template output in TX1)");
    if (opts.light) hasContentFile = template.fileHash != null;
    const rules = decodeTokenRules(template.tokenRules);
    let fees = null;
    if (template.covenantScript) {
      try {
        const ed = parseEditionScript(LockingScript.fromHex(template.covenantScript));
        if (ed) fees = { publisher: ed.terms.publisherFeeSats, holder: ed.terms.holderFeeSats };
      } catch {
      }
    }
    let bondSats = 0;
    if (holderPubKeyHint !== void 0 && template.covenantScript) {
      const sellerPub = holderPubKeyHint ?? publisherPubKeyHex;
      if (sellerPub != null) {
        try {
          const tip = await resolveHolderEdition(provider, { tx1RefHex: tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: template.covenantScript });
          if (tip) bondSats = tip.tokenSats ?? 0;
        } catch {
        }
      }
    }
    const cover = storefront?.coverBytes ? { mimeType: storefront.coverMimeType ?? "application/octet-stream", bytes: storefront.coverBytes } : null;
    const backCover = storefront?.backCoverBytes && (storefront.backCoverMimeType ?? "").toLowerCase().startsWith("image/") ? { mimeType: storefront.backCoverMimeType ?? "image/jpeg", bytes: storefront.backCoverBytes } : null;
    return {
      tx1Ref,
      name: template.tokenName,
      description: storefront?.description ?? "",
      cover,
      backCover,
      encrypted: rules.isEncrypted,
      replicable: rules.isReplicable,
      hasContentFile,
      contentMime,
      fileHash: template.fileHash ?? null,
      license: template.license ?? null,
      licenseRef: template.licenseRef ?? null,
      publisherPubKeyHex,
      fees,
      covenantHex: template.covenantScript,
      bondSats
    };
  }
  function renderCollectionView(info, opts) {
    $("cvTitle").textContent = info.name || "Untitled collection";
    const coverHost = $("cvCover");
    coverHost.innerHTML = "";
    if (cvObjectUrl) {
      URL.revokeObjectURL(cvObjectUrl);
      cvObjectUrl = null;
    }
    if (cvBackObjectUrl) {
      URL.revokeObjectURL(cvBackObjectUrl);
      cvBackObjectUrl = null;
    }
    if (cvPreviewObjectUrl) {
      URL.revokeObjectURL(cvPreviewObjectUrl);
      cvPreviewObjectUrl = null;
    }
    if (info.cover) {
      cvObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(info.cover.bytes)], { type: info.cover.mimeType }));
      const img = document.createElement("img");
      img.src = cvObjectUrl;
      img.className = "cv-cover-img";
      coverHost.append(img);
      if (info.backCover) {
        cvBackObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(info.backCover.bytes)], { type: info.backCover.mimeType }));
        let showingBack = false;
        const flip = document.createElement("button");
        flip.type = "button";
        flip.className = "cv-flip";
        flip.textContent = "\u21C4 Back";
        flip.title = "Flip the cover";
        flip.onclick = () => {
          showingBack = !showingBack;
          img.src = showingBack ? cvBackObjectUrl : cvObjectUrl;
          flip.textContent = showingBack ? "\u21C4 Front" : "\u21C4 Back";
        };
        coverHost.append(flip);
      }
    } else if (opts?.coverUrl) {
      const img = document.createElement("img");
      img.className = "cv-cover-img";
      img.src = opts.coverUrl;
      img.onerror = () => {
        img.remove();
        if (coverHost.childElementCount === 0) coverHost.innerHTML = '<div class="cv-cover-ph">\u{1F3B4}</div>';
      };
      coverHost.append(img);
    } else {
      coverHost.innerHTML = '<div class="cv-cover-ph">\u{1F3B4}</div>';
    }
    const prevHost = $("cvPreview");
    prevHost.innerHTML = "";
    const contentIsAudio = info.contentMime != null ? mimeCategory(info.contentMime) === "audio" : info.contentCategory != null ? info.contentCategory === "audio" : info.hasContentFile;
    const pubForPreview = info.publisherPubKeyHex;
    if (pubForPreview != null && contentIsAudio) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      btn.textContent = "\u{1F3A7} Preview";
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "\u23F3 Loading preview\u2026";
        try {
          const clip = await resolvePreview(provider, pubForPreview, info.tx1Ref);
          if (!clip) {
            btn.textContent = "\u{1F507} No preview yet";
            return;
          }
          if (cvPreviewObjectUrl) URL.revokeObjectURL(cvPreviewObjectUrl);
          cvPreviewObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(clip.bytes)], { type: clip.mimeType || "audio/mpeg" }));
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.autoplay = true;
          audio.src = cvPreviewObjectUrl;
          audio.style.width = "100%";
          audio.setAttribute("controlsList", "nodownload");
          const ext = /mp4|m4a|aac/i.test(clip.mimeType || "") ? "m4a" : "mp3";
          const base = (info.name || "preview").replace(/[\/\\:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "preview";
          const dl = document.createElement("a");
          dl.href = cvPreviewObjectUrl;
          dl.download = `${base}.${ext}`;
          dl.textContent = "\u2B07 Download";
          dl.title = "Download the preview clip";
          dl.style.cssText = "display:inline-block;margin-top:6px;font-size:12px;color:var(--muted);text-decoration:none";
          prevHost.replaceChildren(audio, dl);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "\u{1F3A7} Preview";
          setCvStatus(`Preview failed: ${e.message}`, "error");
        }
      };
      prevHost.append(btn);
    }
    const badges = [];
    if (info.replicable) badges.push('<span class="badge">\u267E Unlimited editions</span>');
    if (info.encrypted) badges.push('<span class="badge" style="background:#9e6a03;color:#1a1206">\u{1F512} Holders only</span>');
    else if (info.hasContentFile) badges.push('<span class="badge" style="background:#21262d;color:var(--fg)">\u{1F4CE} Embedded file</span>');
    if (info.license) {
      const ref = info.licenseRef ? ` title="Full terms: ${escapeHtml(info.licenseRef)}"` : ' title="Immutable licence \u2014 fixed at mint, travels with the coin"';
      badges.push(`<span class="badge" style="background:#1f6feb;color:#fff"${ref}>\u{1F4DC} ${escapeHtml(info.license)}</span>`);
    }
    $("cvBadges").innerHTML = badges.join("");
    $("cvPublisher").innerHTML = info.publisherPubKeyHex ? `by ${nameChip(info.publisherPubKeyHex)}` : "";
    if (info.publisherPubKeyHex != null) {
      const pub = info.publisherPubKeyHex;
      resolveAvatarsThen([pub], () => {
        $("cvPublisher").innerHTML = `by ${nameChip(pub)}`;
      });
    }
    $("cvDesc").textContent = info.description || "(no description provided)";
    const bond = info.bondSats || 0;
    const bondBit = bond > 1 ? ` + ${fmtPrice(bond)} refundable bond` : "";
    const bondTail = bond > 1 ? `; the ${fmtPrice(bond)} bond is reclaimable by burning your copy` : "";
    if (info.fees) {
      const total = info.fees.publisher + info.fees.holder + bond;
      $("cvPrice").innerHTML = `Get your own copy \u2014 <b title="${total.toLocaleString()} sats">${fmtPrice(total)}</b> <span class="muted">(publisher ${info.fees.publisher} + holder ${info.fees.holder}${bondBit}, plus a small network fee${bondTail})</span>`;
    } else {
      $("cvPrice").innerHTML = '<span class="muted">This collection is not a replicable edition.</span>';
    }
    reflectCvOwnership(info);
    const holdsIt = store2.active().some((t) => t.collectionId === info.tx1Ref);
    showViewButton(info, holdsIt);
    $("collectionView").style.display = "flex";
  }
  function showViewButton(info, show) {
    const vb = $("cvView");
    if (show && info.hasContentFile) {
      vb.textContent = info.encrypted ? "\u{1F513} View content" : "View content";
      vb.style.display = "";
    } else {
      vb.style.display = "none";
    }
  }
  function cacheHostFrom(srcHost) {
    let host = (srcHost || "").trim().toLowerCase();
    if (!host && document.referrer) {
      try {
        const r = new URL(document.referrer);
        if (r.origin !== location.origin) host = r.hostname.toLowerCase();
      } catch {
      }
    }
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  }
  async function fetchListingCache(host, collectionId) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4e3);
      const resp = await fetch(`https://${host}/listings.json`, { signal: ctl.signal, mode: "cors" });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const data = await resp.json();
      const it = (data.listings ?? []).find((l) => String(l.collectionId).toLowerCase() === collectionId.toLowerCase());
      if (!it || typeof it.cover !== "string") return null;
      return {
        title: String(it.title ?? ""),
        description: String(it.description ?? ""),
        category: typeof it.category === "string" ? it.category : "other",
        coverUrl: `https://${host}/${it.cover}`
      };
    } catch {
      return null;
    }
  }
  async function openCollectionView(tx1Ref, holderPubKey, giftWif = null, srcHost = null) {
    cvGiftWif = giftWif;
    $("collectionView").style.display = "flex";
    hideFundPrompt();
    $("cvTitle").textContent = "Loading\u2026";
    $("cvCover").innerHTML = "";
    $("cvBadges").innerHTML = "";
    $("cvPublisher").textContent = "";
    $("cvDesc").textContent = "";
    $("cvPrice").innerHTML = "";
    const host = cacheHostFrom(srcHost);
    const cache = host ? await fetchListingCache(host, tx1Ref) : null;
    if (cache) {
      $("cvTitle").textContent = cache.title || "Loading\u2026";
      $("cvDesc").textContent = cache.description || "";
      const skImg = document.createElement("img");
      skImg.className = "cv-cover-img";
      skImg.src = cache.coverUrl;
      skImg.onerror = () => skImg.remove();
      $("cvCover").replaceChildren(skImg);
      $("cvPrice").innerHTML = '<span class="muted">Loading purchase details\u2026</span>';
      setCvStatus("");
    } else {
      setCvStatus("Loading collection from the chain\u2026");
    }
    try {
      let info;
      try {
        info = cache ? await loadCollection(tx1Ref, holderPubKey, { light: true }) : await loadCollection(tx1Ref, holderPubKey);
      } catch (lightErr) {
        if (!cache) throw lightErr;
        info = await loadCollection(tx1Ref, holderPubKey);
      }
      if (cache) info = { ...info, name: info.name || cache.title, description: info.description || cache.description, contentCategory: cache.category };
      currentCollection = { info, holderPubKey };
      renderCollectionView(info, cache ? { coverUrl: cache.coverUrl } : void 0);
      if (info.cover != null) void registerOgAssets(info);
      if (cvGiftWif) {
        setCvGetLabel("\u{1F381} Get your free copy");
        $("cvPrice").innerHTML = '\u{1F381} <b>A free gift from the publisher</b> <span class="muted">\u2014 claim your copy, no payment and no funds needed.</span>';
      }
      setCvStatus("");
      void loadSellerNote(info, holderPubKey ?? info.publisherPubKeyHex);
    } catch (e) {
      currentCollection = null;
      $("cvTitle").textContent = "Collection not found";
      setCvStatus(`Could not load this collection: ${e.message}`, "error");
    }
  }
  function onOpenSalesPage(t) {
    history.replaceState(null, "", `${location.pathname}#c=${t.collectionId}&h=${pubKeyHex}`);
    void openCollectionView(t.collectionId, pubKeyHex);
  }
  function closeCollectionView() {
    $("collectionView").style.display = "none";
    if (cvObjectUrl) {
      URL.revokeObjectURL(cvObjectUrl);
      cvObjectUrl = null;
    }
    if (cvBackObjectUrl) {
      URL.revokeObjectURL(cvBackObjectUrl);
      cvBackObjectUrl = null;
    }
    if (cvPreviewObjectUrl) {
      URL.revokeObjectURL(cvPreviewObjectUrl);
      cvPreviewObjectUrl = null;
    }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  async function currentShareLink() {
    if (!currentCollection) return null;
    const { info, holderPubKey } = currentCollection;
    const h = holderPubKey ?? pubKeyHex;
    return await shortShareBase(info.tx1Ref, h) ?? collectionShareUrl(info.tx1Ref, h);
  }
  async function shareCollectionLink() {
    const link = await currentShareLink();
    if (!link) return;
    void navigator.clipboard?.writeText(link);
    setCvStatus("Share link copied to clipboard.");
  }
  function showQrModal(title, text) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `<div class="modal-box qr-modal-box"><div class="modal-head"><span>${escapeHtml(title)}</span><button class="secondary qr-close">\u2715 Close</button></div><div class="qr-holder">${qrSvg(text)}</div><div class="qr-cap mono">${escapeHtml(text)}</div></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".qr-close")?.addEventListener("click", close);
    document.body.append(overlay);
  }
  function hideBonus() {
    const h = $("cvBonus");
    h.style.display = "none";
    h.innerHTML = "";
  }
  function showBonus(note, claimable) {
    const host = $("cvBonus");
    host.innerHTML = "";
    if (!note?.bonusValue) {
      host.style.display = "none";
      return;
    }
    if (!claimable) {
      host.textContent = "\u{1F381} Includes a bonus \u2014 claim it after you buy.";
    } else if (note.bonusKind === "link") {
      const a = document.createElement("a");
      a.href = note.bonusValue;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "\u{1F381} Claim your bonus \u2197";
      a.className = "bonus-claim";
      host.append(a);
    } else {
      host.append(document.createTextNode("\u{1F381} Bonus code: "));
      const code = document.createElement("span");
      code.className = "mono";
      code.textContent = note.bonusValue;
      const copy = document.createElement("button");
      copy.className = "secondary";
      copy.textContent = "Copy";
      copy.style.marginLeft = "8px";
      copy.onclick = () => void navigator.clipboard?.writeText(note.bonusValue);
      host.append(code, copy);
    }
    host.style.display = "block";
  }
  async function loadSellerNote(info, sellerPub) {
    cvNote = null;
    const noteBox = $("cvNote");
    noteBox.style.display = "none";
    hideBonus();
    const isMine = sellerPub != null && sellerPub === pubKeyHex;
    const holdsIt = store2.active().some((t) => t.collectionId === info.tx1Ref);
    $("cvNoteEdit").style.display = isMine ? "block" : "none";
    $("cvNoteText").value = "";
    $("cvNoteHeading").value = "";
    $("cvNoteTags").value = "";
    $("cvBonusValue").value = "";
    $("cvBonusKind").value = "none";
    $("cvNoteStatus").textContent = "";
    $("cvNoteRefresh").style.display = "none";
    cvNoteRefreshId = null;
    if (sellerPub == null) return;
    let current = null;
    try {
      const note = await resolveSellerNote(provider, sellerPub, info.tx1Ref);
      if (note) current = note;
    } catch {
    }
    if (current == null && info.covenantHex) {
      try {
        const tip = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex });
        if (tip) current = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref);
      } catch {
      }
    }
    if (current == null && isMine) {
      const held = store2.active().find((t) => t.collectionId === info.tx1Ref && (t.sellerNote || t.bonusValue));
      if (held) {
        current = { text: held.sellerNote ?? "", bonusKind: held.bonusKind, bonusValue: held.bonusValue };
        $("cvNoteStatus").textContent = "This is what you received when you bought \u2014 Publish to pass it on.";
      }
    }
    if (current && (current.text || current.bonusValue || current.heading || current.tags && current.tags.length > 0)) {
      cvNote = current;
      paintCvNote(current);
      showBonus(current, holdsIt);
      if (isMine) {
        ;
        $("cvNoteText").value = current.text;
        $("cvNoteHeading").value = current.heading ?? "";
        $("cvNoteTags").value = (current.tags ?? []).map((t) => "#" + t).join(" ");
        if (current.bonusKind && current.bonusValue) {
          ;
          $("cvBonusKind").value = current.bonusKind;
          $("cvBonusValue").value = current.bonusValue;
        }
      }
    }
  }
  function paintCvNote(note) {
    const box = $("cvNote");
    const parts = [];
    if (note.heading) parts.push(`<b>${escapeHtml(note.heading)}</b>`);
    if (note.text) parts.push(`\u{1F4DD} ${escapeHtml(note.text)}`);
    if (note.tags && note.tags.length > 0) parts.push(`<span class="cv-note-tags">${note.tags.map((t) => "#" + escapeHtml(t)).join(" ")}</span>`);
    box.innerHTML = parts.join("<br>");
    box.style.display = parts.length > 0 ? "block" : "none";
  }
  function parseTagsInput(s) {
    return s.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim().toLowerCase()).filter(Boolean);
  }
  async function onSaveSellerNote() {
    const k = requireKey();
    if (k == null) return;
    if (!currentCollection) return;
    const text = $("cvNoteText").value.trim();
    const heading = $("cvNoteHeading").value.trim();
    const tags = parseTagsInput($("cvNoteTags").value);
    const bonusKindRaw = $("cvBonusKind").value;
    const bonusValue = $("cvBonusValue").value.trim();
    const bonusKind = bonusKindRaw === "link" || bonusKindRaw === "code" ? bonusKindRaw : void 0;
    if (!text && !bonusValue && !heading && tags.length === 0) {
      $("cvNoteStatus").textContent = "Add a heading, description, tags, or a bonus first.";
      return;
    }
    if (bonusValue && !bonusKind) {
      $("cvNoteStatus").textContent = "Pick a bonus type (link or code).";
      return;
    }
    const note = { text, heading: heading || void 0, tags: tags.length > 0 ? tags : void 0, bonusKind, bonusValue: bonusValue || void 0 };
    $("cvNoteStatus").textContent = "Publishing your note\u2026";
    try {
      const txId = await publishSellerNote(provider, k, currentCollection.info.tx1Ref, note);
      cvNote = note;
      paintCvNote(note);
      showBonus(note, true);
      cvNoteRefreshId = currentCollection.info.tx1Ref;
      $("cvNoteRefresh").style.display = "";
      $("cvNoteStatus").innerHTML = `Published (${idChip(txId)}). Now hit \u201CRefresh nft.sale\u201D to update the listing.`;
    } catch (e) {
      $("cvNoteStatus").textContent = `Failed: ${e.message}`;
    }
  }
  async function onRefreshNote() {
    if (!cvNoteRefreshId) return;
    const btn = $("cvNoteRefresh");
    btn.disabled = true;
    $("cvNoteStatus").textContent = "Asking nft.sale to refresh\u2026";
    try {
      const res = await fetch(`${NFTSALE_ORIGIN}/refresh.php?collection-id=${cvNoteRefreshId}`);
      const first = (await res.text()).trim().split("\n")[0];
      $("cvNoteStatus").textContent = res.ok ? `\u2713 ${first || "queued"} \u2014 updates on the next curator run.` : `Refresh failed: ${first || res.status}`;
    } catch (e) {
      $("cvNoteStatus").textContent = `Refresh request failed (is nft.sale reachable?): ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  }
  function showFundPrompt(needed, have) {
    $("cvFundNeed").textContent = `${needed} sats`;
    $("cvFundHave").textContent = `${have} sats`;
    $("cvFundAddr").textContent = address;
    $("cvFundQr").innerHTML = `<div class="qr-holder qr-fund">${qrSvg(bsvPaymentUri(address, needed))}</div>`;
    $("cvFund").style.display = "block";
    setCvStatus("Not enough funds yet \u2014 send a little BSV to your wallet, then click \u201CI\u2019ve funded\u201D.", "error");
    $("cvFund").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function hideFundPrompt() {
    $("cvFund").style.display = "none";
  }
  var buying = false;
  async function onGetCopy() {
    if (buying || !currentCollection) return;
    const k = requireKey();
    if (k == null) return;
    const { info, holderPubKey } = currentCollection;
    if (!info.fees || !info.covenantHex) {
      setCvStatus("This collection is not a buyable edition.", "error");
      return;
    }
    const sellerPub = holderPubKey ?? info.publisherPubKeyHex;
    if (!sellerPub) {
      setCvStatus("No seller could be determined for this link.", "error");
      return;
    }
    buying = true;
    setCvGetDisabled(true);
    try {
      setCvStatus("Finding the seller\u2019s current edition\u2026");
      let tip = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex });
      if (!tip) {
        setCvStatus("This seller has no edition available right now \u2014 try another link or ask them to mint one.", "error");
        return;
      }
      if (cvGiftWif) {
        if (!confirm("Add this NFT gift to your wallet now?\n\nIt will be claimed to the wallet on THIS browser and device \u2014 make sure this is where you want to keep it.\n\nOr you can cancel and instead claim it later, on a different browser or device, from the same link.")) {
          setCvStatus("No problem \u2014 your gift is still waiting. Claim it any time from this link.");
          return;
        }
        if (needsSeedBackup()) {
          await new Promise((resolve) => showSeedModal(localStorage.getItem(MNEMONIC_KEY) ?? "", {
            gated: true,
            intro: "First, secure your new wallet \u2014 this seed phrase is the ONLY key to the NFT gift you\u2019re about to claim. Write it down before we add it to your wallet.",
            onDone: () => resolve()
          }));
        }
        let giftNote = cvNote;
        if (!giftNote) {
          try {
            giftNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref);
          } catch {
          }
        }
        setCvStatus("\u{1F381} Claiming your free copy\u2026");
        const claimed = await claimGiftEdition(provider, k, {
          giftWif: cvGiftWif,
          editionTxId: tip.txId,
          editionOutputIndex: tip.outputIndex,
          editionLockHex: tip.lockHex,
          note: giftNote ?? void 0
        });
        storeEdition(
          { txId: claimed.replicaOutpoint.txId, outputIndex: claimed.replicaOutpoint.outputIndex, lockHex: claimed.lockHex },
          info.tx1Ref,
          info.name,
          tip.terms,
          giftNote
        );
        renderTokens();
        rememberGifter();
        showViewButton(info, true);
        cvGiftWif = null;
        setCvStatus("\u2705 Added to your wallet \u2014 opening your gift\u2026", "ok");
        void onView(info.tx1Ref, info.name);
        return;
      }
      const publisherCut = tip.terms.publisherFeeSats;
      const resellerCut = tip.terms.holderFeeSats;
      const price = publisherCut + resellerCut;
      const bond = tip.tokenSats;
      const priceDetail = `publisher ${publisherCut.toLocaleString()} + holder ${resellerCut.toLocaleString()}`;
      let approved = false;
      const confirmBuy = (totalSats) => {
        if (approved) return true;
        const showBond = bond > 1;
        const networkFee = Math.max(0, totalSats - price - (showBond ? bond : 0));
        approved = confirm(
          `Buy a copy of \u201C${info.name}\u201D?

Seller's price:   ${price.toLocaleString()} sats  (${priceDetail})
` + (showBond ? `Refundable bond:  ${bond.toLocaleString()} sats  (held in your copy \u2014 reclaim by burning)
` : "") + `Network fee:      ${networkFee.toLocaleString()} sats
\u2014\u2014\u2014\u2014\u2014\u2014\u2014
Total to pay:     ${totalSats.toLocaleString()} sats

Instant, on-chain purchase.`
        );
        return approved;
      };
      const needed = price + tip.tokenSats + 1200;
      const have = (await getSafeUtxos(provider)).reduce((s, u) => s + u.satoshis, 0);
      if (have < needed) {
        showFundPrompt(needed, have);
        return;
      }
      hideFundPrompt();
      let echoNote = cvNote;
      if (!echoNote) {
        try {
          echoNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref);
        } catch {
        }
      }
      setCvStatus("Buying your copy \u2014 replicating the edition\u2026");
      let bought = null;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          bought = await replicateEdition(provider, k, { editionTxId: tip.txId, editionOutputIndex: tip.outputIndex, editionLockHex: tip.lockHex, terms: tip.terms, note: echoNote ?? void 0, confirmSpend: confirmBuy });
          break;
        } catch (e) {
          if (e.message === SPEND_CANCELLED) throw e;
          if (attempt === 2) throw e;
          setCvStatus("Another buyer was first \u2014 finding the seller\u2019s new edition\u2026");
          const again = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex });
          if (!again) throw new Error("the seller\u2019s edition is no longer available");
          tip = again;
        }
      }
      if (!bought) return;
      storeEdition(
        { txId: bought.replicaOutpoint.txId, outputIndex: bought.replicaOutpoint.outputIndex, lockHex: bought.lockHex },
        info.tx1Ref,
        info.name,
        tip.terms,
        echoNote
      );
      renderTokens();
      showViewButton(info, true);
      showBonus(echoNote, true);
      setCvStatus(
        `\u2705 You own a copy of \u201C${info.name}\u201D! Tx ${short(bought.txId)} \u2014 it\u2019s now in your wallet.` + (echoNote?.text ? `
\u{1F4DD} Seller\u2019s note: ${echoNote.text}` : "") + (echoNote?.bonusValue ? "\n\u{1F381} Bonus included \u2014 claim it below / on the NFT card." : "")
      );
      if (info.hasContentFile) void onView(info.tx1Ref, info.name);
    } catch (e) {
      const msg = e.message;
      if (msg === SPEND_CANCELLED) {
        setCvStatus("Purchase cancelled \u2014 nothing was spent.");
        return;
      }
      setCvStatus(`Could not complete the purchase: ${msg}`, "error");
    } finally {
      buying = false;
      reflectCvOwnership(info);
    }
  }
  async function onBroadcast(t) {
    const k = requireKey();
    if (k == null) return;
    const text = prompt(`Announce to all holders of \u201C${t.collectionName ?? "this collection"}\u201D.

Public, one transaction, reaches every current holder. Message:`);
    if (text == null) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus("Announcement was empty.", "error");
      return;
    }
    setStatus("Publishing announcement to holders\u2026");
    try {
      const txId = await publishBroadcast(provider, k, t.collectionId, trimmed, getMyAlias());
      latestBroadcast.set(t.collectionId, { text: trimmed, txId, height: 0 });
      renderTokens();
      setStatusHtml(`\u{1F4E3} Announcement published (${idChip(txId)}). Holders see it when they check Updates.`, "ok");
    } catch (e) {
      setStatus(`Broadcast failed: ${e.message}`, "error");
    }
  }
  async function onGiftCopies(t) {
    const k = requireKey();
    if (k == null) return;
    let claimCost = 0, publisherCut = 0;
    try {
      const ed = parseEditionScript(LockingScript.fromHex(t.lockHex ?? ""));
      if (ed) {
        claimCost = ed.terms.publisherFeeSats + ed.terms.holderFeeSats;
        publisherCut = ed.terms.publisherFeeSats;
      }
    } catch {
    }
    const bond = t.tokenSats ?? EDITION_BOND_SATS;
    const MINER = 700;
    const fundEach = bond + claimCost + MINER + 800;
    const iAmPublisher = t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex === myPubKeyHash();
    const netEach = bond + MINER + (iAmPublisher ? 0 : publisherCut);
    const roleLine = iAmPublisher ? `You're the publisher: your price + fees return on each claim, so a claimed gift nets \u2248 ${netEach.toLocaleString()} sats (the ${bond.toLocaleString()}-sat bond moves to the recipient, + miner fee).` : `As a reseller: your share returns, but the publisher's ${publisherCut.toLocaleString()}-sat cut and the ${bond.toLocaleString()}-sat bond don't \u2014 so a claimed gift nets \u2248 ${netEach.toLocaleString()} sats (think of it as marketing spend).`;
    const countStr = prompt(
      `Create free-gift links for \u201C${t.collectionName ?? "this collection"}\u201D.

How many?  Each voucher is pre-funded with ~${fundEach.toLocaleString()} sats now; unclaimed links are fully recoverable via \u201C\u267B Reclaim gifts\u201D.

${roleLine}`,
      "10"
    );
    if (countStr == null) return;
    const count = Math.max(1, Math.min(500, parseInt(countStr, 10) || 0));
    const total = count * fundEach;
    if (!confirm(
      `Fund ${count} gift link(s):
\u2022 ~${total.toLocaleString()} sats locked now (recoverable if unclaimed)
\u2022 net \u2248 ${(count * netEach).toLocaleString()} sats once all ${count} are claimed

Proceed?`
    )) return;
    setStatus(`Creating ${count} funded gift link(s)\u2026`);
    try {
      const { nextIndex } = await scanGiftVouchers(provider, k, t.collectionId);
      const { fundingTxId, voucherWifs } = await createGiftVouchers(provider, k, { tx1RefHex: t.collectionId, startIndex: nextIndex, count, fundEachSats: fundEach });
      const giftBase = await shortShareBase(t.collectionId, pubKeyHex);
      const links = voucherWifs.map((wif) => giftBase ? `${giftBase}#g=${wif}` : collectionShareUrl(t.collectionId, pubKeyHex, wif));
      setStatus(`\u2705 ${count} gift link(s) funded (tx ${short(fundingTxId)}). Recover them anytime with "Gift links".`, "ok");
      showGiftLinksModal(t.collectionName ?? "Free gift", links);
    } catch (e) {
      setStatus(`Gift creation failed: ${e.message}`, "error");
    }
  }
  async function onViewGiftLinks(t) {
    const k = requireKey();
    if (k == null) return;
    setStatus("Recovering your gift links from chain\u2026");
    try {
      const scan = await scanGiftVouchers(provider, k, t.collectionId);
      const giftBase = await shortShareBase(t.collectionId, pubKeyHex);
      const links = scan.live.map((v) => giftBase ? `${giftBase}#g=${v.wif}` : collectionShareUrl(t.collectionId, pubKeyHex, v.wif));
      if (links.length === 0) {
        setStatus(scan.claimedCount > 0 ? `No unclaimed gift links left \u2014 all ${scan.claimedCount} have been claimed.` : "No gift links found for this collection yet.", "info");
        return;
      }
      showGiftLinksModal(t.collectionName ?? "Gift links", links);
      setStatus(`Recovered ${links.length} unclaimed gift link(s)${scan.claimedCount > 0 ? ` (${scan.claimedCount} already claimed)` : ""}.`, "ok");
    } catch (e) {
      setStatus(`Recover gift links failed: ${e.message}`, "error");
    }
  }
  async function onReclaimGifts(t) {
    const k = requireKey();
    if (k == null) return;
    setStatus("Scanning for unclaimed gift links\u2026");
    let scan;
    try {
      scan = await scanGiftVouchers(provider, k, t.collectionId);
    } catch (e) {
      setStatus(`Scan failed: ${e.message}`, "error");
      return;
    }
    if (scan.live.length === 0) {
      setStatus(scan.claimedCount > 0 ? `Nothing to reclaim \u2014 all ${scan.claimedCount} gift links were claimed.` : "No unclaimed gift links to reclaim.", "ok");
      return;
    }
    if (!confirm(
      `Reclaim ${scan.live.length} UNCLAIMED gift link${scan.live.length > 1 ? "s" : ""} for \u201C${t.collectionName ?? "this collection"}\u201D?

This INVALIDATES those links and returns their pre-funded sats to your wallet (minus the network fee). Already-claimed gifts are unaffected.`
    )) return;
    setStatus("Reclaiming unclaimed gifts\u2026");
    try {
      const r = await sweepGiftVouchers(provider, k, scan.live);
      if (r == null) {
        setStatus("Nothing to reclaim \u2014 the links may have just been claimed.", "ok");
        return;
      }
      setStatus(`\u267B Reclaimed ${r.swept} unclaimed gift${r.swept > 1 ? "s" : ""} \u2014 ${r.reclaimedSats.toLocaleString()} sats back to your wallet. Tx ${short(r.txId)}.`, "ok");
      void refreshBalance();
    } catch (e) {
      setStatus(`Reclaim failed: ${e.message}`, "error");
    }
  }
  function showGiftLinksModal(title, links) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const rows = links.map((l, i) => `<div class="gift-row"><span class="mono gift-link">${escapeHtml(l)}</span><button class="secondary gift-qr" data-i="${i}">QR</button></div>`).join("");
    overlay.innerHTML = `<div class="modal-box gift-modal-box"><div class="modal-head"><span>\u{1F381} ${escapeHtml(title)} \u2014 ${links.length} gift link${links.length > 1 ? "s" : ""}</span><button class="secondary gift-close">\u2715 Close</button></div><div class="row" style="margin-bottom:10px"><button class="gift-copyall">Copy all</button><button class="secondary gift-download">Download .txt</button></div><div class="gift-list">${rows}</div><p class="muted" style="font-size:11px;margin-top:10px">Each link is single-use and pre-funded. Hand them out (email, DM, in person); the recipient claims a free copy and can resell it \u2014 your publisher fee returns on every resale.</p></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".gift-close")?.addEventListener("click", close);
    overlay.querySelector(".gift-copyall")?.addEventListener("click", () => void navigator.clipboard?.writeText(links.join("\n")));
    overlay.querySelector(".gift-download")?.addEventListener("click", () => {
      const blob = new Blob([links.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "smart-nfts-gift-links.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    overlay.querySelectorAll(".gift-qr").forEach((b) => b.addEventListener("click", () => {
      showQrModal("Scan to claim a free copy", links[parseInt(b.dataset.i ?? "0", 10)]);
    }));
    document.body.append(overlay);
  }
  async function onViewBuyers(t) {
    if (t.publisherPubKeyHashHex == null) return;
    const title = t.collectionName ?? "Collection";
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `<div class="modal-box gift-modal-box"><div class="modal-head"><span>\u{1F465} Buyers of ${escapeHtml(title)}</span><span class="row" style="gap:6px"><button class="secondary buyers-refresh">\u{1F504} Refresh</button><button class="secondary buyers-close">\u2715 Close</button></span></div><p class="buyers-status muted" style="font-size:12px">Scanning your sales\u2026</p><div class="buyers-toolbar" hidden><label class="buyers-selall"><input type="checkbox" class="buyers-all" /> Select all</label><button class="buyers-msg-sel" disabled>\u2709 Message selected (0)</button></div><div class="buyers-list"></div><p class="muted" style="font-size:11px;margin-top:10px">Buyers at point of sale (when they replicated a copy). Onward transfers aren\u2019t visible to you, so this isn\u2019t a current-owner list.</p></div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".buyers-close")?.addEventListener("click", close);
    document.body.append(overlay);
    const statusEl = overlay.querySelector(".buyers-status");
    const listEl = overlay.querySelector(".buyers-list");
    const refreshBtn = overlay.querySelector(".buyers-refresh");
    const toolbarEl = overlay.querySelector(".buyers-toolbar");
    const allEl = overlay.querySelector(".buyers-all");
    const msgSelBtn = overlay.querySelector(".buyers-msg-sel");
    const selected = /* @__PURE__ */ new Set();
    let lastBuyers = [];
    const updateSelUI = () => {
      msgSelBtn.disabled = selected.size === 0;
      msgSelBtn.textContent = `\u2709 Message selected (${selected.size})`;
      allEl.checked = lastBuyers.length > 0 && lastBuyers.every((b) => selected.has(b.pubKeyHex));
    };
    const render = (res) => {
      lastBuyers = res.buyers;
      if (res.buyers.length === 0) {
        statusEl.textContent = `No buyers yet \u2014 no one has replicated a copy (scanned ${res.scanned} tx${res.scanned === 1 ? "" : "s"}).`;
        toolbarEl.hidden = true;
        return;
      }
      statusEl.textContent = `${res.buyers.length} buyer${res.buyers.length > 1 ? "s" : ""}${res.capped ? ` \xB7 most recent ${res.scanned} txs` : ""}`;
      toolbarEl.hidden = false;
      listEl.innerHTML = "";
      for (const b of res.buyers) {
        const row = document.createElement("div");
        row.className = "buyer-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "buyer-sel";
        cb.checked = selected.has(b.pubKeyHex);
        cb.onchange = () => {
          if (cb.checked) selected.add(b.pubKeyHex);
          else selected.delete(b.pubKeyHex);
          updateSelUI();
        };
        const who = document.createElement("div");
        who.className = "buyer-who";
        who.innerHTML = `${nameChip(b.pubKeyHex)}${b.count > 1 ? ` <span class="muted">\xD7${b.count}</span>` : ""}`;
        const msg = document.createElement("button");
        msg.className = "secondary";
        msg.textContent = "\u2709 Message";
        msg.onclick = () => composeTo(b.pubKeyHex, "this buyer", { product: title, recipientRole: "buyer" });
        row.append(cb, who, msg);
        listEl.append(row);
      }
      updateSelUI();
    };
    allEl.onchange = () => {
      if (allEl.checked) lastBuyers.forEach((b) => selected.add(b.pubKeyHex));
      else selected.clear();
      listEl.querySelectorAll(".buyer-sel").forEach((cb, i) => {
        cb.checked = selected.has(lastBuyers[i].pubKeyHex);
      });
      updateSelUI();
    };
    msgSelBtn.onclick = () => {
      if (selected.size) openCompose([...selected], { who: `${selected.size} buyers`, product: title, recipientRole: "buyer" });
    };
    const scan = async () => {
      refreshBtn.disabled = true;
      listEl.innerHTML = "";
      statusEl.textContent = "Scanning your sales\u2026";
      try {
        const res = await scanCollectionBuyers(provider, {
          collectionId: t.collectionId,
          publisherPubKeyHashHex: t.publisherPubKeyHashHex,
          onProgress: (done, total) => {
            statusEl.textContent = `Scanning your sales\u2026 ${done}/${total}`;
          }
        });
        render(res);
        if (res.buyers.length) resolveAvatarsThen(res.buyers.map((b) => b.pubKeyHex), () => {
          if (document.body.contains(overlay)) render(res);
        });
      } catch (e) {
        statusEl.textContent = `Scan failed: ${e.message}`;
      } finally {
        refreshBtn.disabled = false;
      }
    };
    refreshBtn.onclick = () => void scan();
    await scan();
  }
  var salesCache = null;
  var salesHeight = 0;
  var salesNames = /* @__PURE__ */ new Map();
  var BLOCKS_PER_DAY = 144;
  var fmtBsv = (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, "") || "0";
  var giftsDone = /* @__PURE__ */ new WeakSet();
  function p2pkhInputPubKeyHash(input) {
    try {
      const chunks = Script.fromBinary(input.script).chunks;
      if (chunks == null || chunks.length < 2) return null;
      const pub = chunks[chunks.length - 1].data;
      if (pub == null || pub.length !== 33 && pub.length !== 65) return null;
      return hexOf(hash160Bytes(pub)).toLowerCase();
    } catch {
      return null;
    }
  }
  async function renderSalesTab(force = false) {
    const statsEl = $("salesStats");
    const statusEl = $("salesStatus");
    const bodyEl = $("salesBody");
    const refreshBtn = $("btnSalesRefresh");
    if (salesCache != null && !force) {
      paintSales(salesCache, salesHeight);
      return;
    }
    refreshBtn.disabled = true;
    statsEl.innerHTML = "";
    bodyEl.innerHTML = "";
    statusEl.textContent = "Scanning your sales\u2026";
    try {
      const height = await provider.getChainHeight().catch(() => 0);
      const res = await scanMySales(provider, {
        myPubKeyHex: pubKeyHex,
        myHash: myPubKeyHash(),
        onProgress: (d, t) => {
          statusEl.textContent = `Scanning your sales\u2026 ${d}/${t}`;
        }
      });
      salesCache = res;
      salesHeight = height;
      const cids = [...new Set(res.sales.map((s) => s.collectionId))];
      await Promise.all(cids.map(async (c) => {
        if (!salesNames.has(c)) {
          try {
            salesNames.set(c, await resolveCollectionName(c));
          } catch {
            salesNames.set(c, short(c));
          }
        }
      }));
      paintSales(res, height);
      void fillGiftStats(res, height);
      const keys = res.sales.map((s) => s.buyerPubKeyHex);
      if (keys.length) resolveAvatarsThen(keys, () => {
        if (salesCache === res) paintSales(res, height);
      });
    } catch (e) {
      statusEl.textContent = `Scan failed: ${e.message}`;
    } finally {
      refreshBtn.disabled = false;
    }
  }
  function statTile(label, value, sub) {
    return `<div class="stat-tile"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-val">${value}</div><div class="stat-sub muted">${escapeHtml(sub)}</div></div>`;
  }
  function paintSales(res, height) {
    const statsEl = $("salesStats");
    const statusEl = $("salesStatus");
    const bodyEl = $("salesBody");
    const monthFloor = height > 0 ? height - 30 * BLOCKS_PER_DAY : 0;
    const inMonth = (h) => height === 0 || h === 0 || h >= monthFloor;
    const S = res.sales;
    const earnOf = (x) => x.publisherFeeSats + x.holderFeeSats;
    const earned = S.reduce((s, x) => s + earnOf(x), 0);
    const earnedMonth = S.filter((x) => inMonth(x.height)).reduce((s, x) => s + earnOf(x), 0);
    const salesMonth = S.filter((x) => inMonth(x.height)).length;
    const uniqueBuyers = new Set(S.map((x) => x.buyerPubKeyHex.toLowerCase())).size;
    const top = res.asCreator[0] ?? res.asReseller[0];
    const noHeight = height === 0;
    const monthLbl = noHeight ? "period n/a" : "this month";
    const giftsKnown = giftsDone.has(res);
    const giftCount = giftsKnown ? S.filter((s) => s.isGift).length : 0;
    const giftEarned = giftsKnown ? S.filter((s) => s.isGift).reduce((s, x) => s + earnOf(x), 0) : 0;
    const netEarned = earned - giftEarned;
    const giftVal = !giftsKnown ? '<span class="muted">\u2026</span>' : key == null ? "\u2014" : String(giftCount);
    const netVal = key == null ? "\u2014" : !giftsKnown ? '<span class="muted">\u2026</span>' : `${netEarned.toLocaleString()} <span class="stat-unit">sat</span>`;
    const netSub = !giftsKnown ? "gifts excluded \u2014 checking\u2026" : giftCount === 0 ? "no gift claims \u2014 same as earned" : `${fmtBsv(netEarned)} BSV \xB7 excl. ${giftCount} gift claim${giftCount === 1 ? "" : "s"} (\u2212${giftEarned.toLocaleString()} sat)`;
    statsEl.innerHTML = '<div class="stat-grid">' + statTile("Sales", String(S.length), `${salesMonth} ${monthLbl}`) + statTile("Earned", `${earned.toLocaleString()} <span class="stat-unit">sat</span>`, `${fmtBsv(earned)} BSV \xB7 ${earnedMonth.toLocaleString()} sat ${monthLbl}`) + statTile("Net revenue", netVal, netSub) + statTile("Unique buyers", String(uniqueBuyers), top != null ? `top: ${escapeHtml(salesNames.get(top.collectionId) ?? short(top.collectionId))}` : "across your sales") + statTile("Gifts", giftVal, "claimed via gift links") + "</div>";
    statusEl.textContent = `${S.length} sale${S.length === 1 ? "" : "s"}${res.capped ? ` \xB7 most recent ${res.scanned} txs` : ""}${noHeight ? " \xB7 block height unavailable, periods approximate" : ""}`;
    bodyEl.innerHTML = "";
    bodyEl.append(salesUnified(S, salesNames));
  }
  function salesUnified(sales, names) {
    const sec = document.createElement("div");
    sec.className = "token-section";
    const head = document.createElement("div");
    head.className = "token-section-head";
    head.style.cursor = "default";
    head.innerHTML = `<span class="token-section-label">\u{1F9FE} Your sales \u2014 each purchase once, with what you earned</span> <span class="count">${sales.length}</span>`;
    sec.append(head);
    if (sales.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.style.fontSize = "12px";
      p.textContent = "No sales yet.";
      sec.append(p);
      return sec;
    }
    const byCol = /* @__PURE__ */ new Map();
    for (const s of sales) {
      const a = byCol.get(s.collectionId) ?? [];
      a.push(s);
      byCol.set(s.collectionId, a);
    }
    const groups = [...byCol.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [cid, list] of groups) {
      const name = names.get(cid) ?? short(cid);
      const groupEarned = list.reduce((s, x) => s + x.publisherFeeSats + x.holderFeeSats, 0);
      const buyerKeys = /* @__PURE__ */ new Map();
      for (const s of list) if (!buyerKeys.has(s.buyerPubKeyHex.toLowerCase())) buyerKeys.set(s.buyerPubKeyHex.toLowerCase(), s.buyerPubKeyHex);
      const uniq = [...buyerKeys.values()];
      const card2 = document.createElement("div");
      card2.className = "sales-group";
      const giftN = list.filter((s) => s.isGift).length;
      const gh = document.createElement("button");
      gh.type = "button";
      gh.className = "sales-group-head";
      gh.innerHTML = `<span class="chev">\u25B8</span> <span class="sales-group-name">${escapeHtml(name)}</span><span class="sales-group-meta">${list.length} sale${list.length === 1 ? "" : "s"} \xB7 ${uniq.length} buyer${uniq.length === 1 ? "" : "s"} \xB7 ${groupEarned.toLocaleString()} sat${giftN > 0 ? ` \xB7 <span class="gift-badge">\u{1F381} ${giftN} gifted</span>` : ""}</span>`;
      const body = document.createElement("div");
      body.className = "buyers-list";
      body.hidden = true;
      const msgAll = document.createElement("button");
      msgAll.className = "secondary";
      msgAll.style.margin = "6px 0";
      msgAll.textContent = `\u2709 Message all ${uniq.length}`;
      msgAll.onclick = () => openCompose(uniq, { who: `${uniq.length} buyer${uniq.length === 1 ? "" : "s"}`, product: name, recipientRole: "buyer" });
      body.append(msgAll);
      for (const s of [...list].sort((a, b) => (b.time || b.height || 0) - (a.time || a.height || 0))) {
        const row = document.createElement("div");
        row.className = "buyer-row";
        const who = document.createElement("div");
        who.className = "buyer-who";
        const date = s.time ? new Date(s.time * 1e3).toLocaleDateString(void 0, { month: "short", day: "numeric" }) : s.height ? "" : "pending";
        const amt = s.publisherFeeSats + s.holderFeeSats;
        const kind = s.publisherFeeSats > 0 && s.holderFeeSats > 0 ? "both fees" : s.publisherFeeSats > 0 ? "publisher fee" : "holder fee";
        who.innerHTML = `${nameChip(s.buyerPubKeyHex)} <span class="sale-tag muted">${date ? escapeHtml(date) + " \xB7 " : ""}${kind} \xB7 +${amt.toLocaleString()} sat</span>${s.isGift ? ' <span class="gift-badge">\u{1F381} gift</span>' : ""}`;
        const msg = document.createElement("button");
        msg.className = "secondary";
        msg.textContent = "\u2709 Message";
        msg.onclick = () => composeTo(s.buyerPubKeyHex, "this buyer", { product: name, recipientRole: "buyer" });
        row.append(who, msg);
        body.append(row);
      }
      gh.onclick = () => {
        body.hidden = !body.hidden;
        gh.querySelector(".chev").textContent = body.hidden ? "\u25B8" : "\u25BE";
      };
      card2.append(gh, body);
      sec.append(card2);
    }
    return sec;
  }
  async function fillGiftStats(res, height) {
    if (key != null) {
      const byCid = /* @__PURE__ */ new Map();
      for (const s of res.sales) if (s.publisherFeeSats > 0) {
        const a = byCid.get(s.collectionId) ?? [];
        a.push(s);
        byCid.set(s.collectionId, a);
      }
      for (const [cid, list] of byCid) {
        let hashes;
        try {
          hashes = await scanVoucherHashes(provider, key, cid);
        } catch {
          continue;
        }
        if (hashes.size === 0) continue;
        await Promise.all(list.map(async (s) => {
          try {
            const tx = await provider.getSourceTransaction(s.txId);
            for (let i = 1; i < tx.inputs.length; i++) {
              const pkh = p2pkhInputPubKeyHash(tx.inputs[i]);
              if (pkh != null && hashes.has(pkh)) {
                s.isGift = true;
                break;
              }
            }
          } catch {
          }
        }));
      }
    }
    if (salesCache !== res) return;
    giftsDone.add(res);
    paintSales(res, height);
  }
  var discAnchor = null;
  function discRooms() {
    const seen = /* @__PURE__ */ new Set();
    const rooms = [];
    for (const t of store2.active()) {
      if (t.kind !== "edition" || seen.has(t.collectionId)) continue;
      seen.add(t.collectionId);
      rooms.push(t);
    }
    return rooms;
  }
  function renderDiscRooms() {
    const host = $("discRooms");
    const thread = $("discThread");
    discAnchor = null;
    thread.hidden = true;
    thread.innerHTML = "";
    host.hidden = false;
    const rooms = discRooms();
    if (rooms.length === 0) {
      host.innerHTML = '<p class="muted">No discussions yet \u2014 hold or publish an edition to join its lineage corridor.</p>';
      return;
    }
    host.innerHTML = "";
    for (const t of rooms) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "disc-room";
      row.innerHTML = `<span class="disc-room-name">${escapeHtml(t.collectionName ?? "Collection")}</span><span class="disc-room-meta">enter \u25B8</span>`;
      row.onclick = () => void openDiscRoom(t);
      host.append(row);
    }
  }
  async function openDiscRoom(t) {
    discAnchor = t;
    const host = $("discRooms");
    const thread = $("discThread");
    host.hidden = true;
    thread.hidden = false;
    thread.innerHTML = `<div class="disc-head"><button class="secondary disc-back">\u2190 Rooms</button><h3>${escapeHtml(t.collectionName ?? "Collection")}</h3><button class="secondary disc-reload">\u{1F504}</button></div><div class="disc-compose"><textarea class="disc-text" rows="3" placeholder="Post to your line\u2026"></textarea><div class="disc-compose-row"><label class="muted" style="font-size:12px">Post to <select class="disc-target"></select></label><button class="disc-send">Post</button><span class="disc-status muted" style="font-size:12px"></span></div></div><div class="disc-feed"><p class="muted">Loading corridor\u2026</p></div>`;
    thread.querySelector(".disc-back").addEventListener("click", () => renderDiscRooms());
    thread.querySelector(".disc-reload").addEventListener("click", () => void loadDiscThread(t));
    await loadDiscThread(t);
  }
  async function loadDiscThread(t) {
    const thread = $("discThread");
    const feedEl = thread.querySelector(".disc-feed");
    const targetEl = thread.querySelector(".disc-target");
    const sendBtn = thread.querySelector(".disc-send");
    const textEl = thread.querySelector(".disc-text");
    const statusEl = thread.querySelector(".disc-status");
    sendBtn.disabled = false;
    feedEl.innerHTML = '<p class="muted">Loading corridor\u2026</p>';
    const iAmPublisher = t.publisherPubKeyHashHex === myPubKeyHash();
    let result;
    try {
      result = await readCorridor(provider, t.txId, t.outputIndex, t.collectionId, { rootDownstream: iAmPublisher });
    } catch (e) {
      feedEl.innerHTML = `<p class="muted">Couldn\u2019t load this corridor: ${escapeHtml(e.message)}</p>`;
      return;
    }
    const opts = [];
    const selfNode = result.nodes.find((n) => n.isSelf);
    if (selfNode) opts.push({ node: selfNode, label: "your line" });
    for (const n of result.nodes) {
      if (n.isRoot) {
        if (iAmPublisher) opts.push({ node: n, label: "\u{1F4E3} everyone (collection)" });
        continue;
      }
      if (!n.isSelf) opts.push({ node: n, label: `\u2B06 reply to ${displayName(n.ownerPubKeyHex).name}` });
    }
    targetEl.innerHTML = opts.map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`).join("");
    sendBtn.onclick = () => void (async () => {
      const k = requireKey();
      if (k == null) return;
      const text = textEl.value.trim();
      if (text === "") {
        statusEl.textContent = "Write something first.";
        return;
      }
      const target = opts[parseInt(targetEl.value || "0", 10)]?.node;
      if (target == null) {
        statusEl.textContent = "No post target available.";
        return;
      }
      const targetIdx = result.nodes.indexOf(target);
      const downBreadcrumbs = result.nodes.slice(0, targetIdx < 0 ? 0 : targetIdx).map((n) => n.downHash160);
      sendBtn.disabled = true;
      statusEl.textContent = "Posting\u2026";
      try {
        await postToNodeFeed(provider, k, { feedHash160: target.feedHash160, ref: target.ref, text, senderAlias: getMyAlias(), downBreadcrumbs });
        textEl.value = "";
        statusEl.textContent = "\u2705 Posted.";
        setTimeout(() => {
          if (discAnchor === t) void loadDiscThread(t);
        }, 900);
      } catch (e) {
        statusEl.textContent = `Post failed: ${e.message}`;
        sendBtn.disabled = false;
      }
    })();
    const ctx = { nodes: result.nodes, publisherHash: t.publisherPubKeyHashHex?.toLowerCase() };
    renderDiscFeed(feedEl, result.posts, ctx);
    if (result.posts.length) resolveAvatarsThen(result.posts.map((p) => p.authorPubKeyHex), () => {
      if (discAnchor === t) renderDiscFeed(feedEl, result.posts, ctx);
    });
  }
  function discIdentityBadge(authorPubKeyHex, ctx) {
    const a = authorPubKeyHex.toLowerCase();
    try {
      if (ctx.publisherHash != null && hexOf(hash160Bytes(hexBytes(authorPubKeyHex))) === ctx.publisherHash) {
        return '<span class="disc-badge creator" title="Verified creator \u2014 this key controls the collection\u2019s covenant">\u{1F451} creator</span>';
      }
    } catch {
    }
    const owned = ctx.nodes.find((n) => n.ownerPubKeyHex !== "" && n.ownerPubKeyHex.toLowerCase() === a);
    if (owned != null) return owned.isGenesis ? '<span class="disc-badge senior" title="Original holder \u2014 owns a genesis copy">\u{1F331} original holder</span>' : '<span class="disc-badge senior" title="Verified holder in this lineage">\u2713 holder</span>';
    return "";
  }
  function renderDiscFeed(feedEl, posts, ctx) {
    if (posts.length === 0) {
      feedEl.innerHTML = '<p class="muted">No posts yet \u2014 be the first to post to your line.</p>';
      return;
    }
    feedEl.innerHTML = "";
    for (const p of posts) {
      const pos = p.node.isDownstream ? '<span class="disc-badge down">\u2B07 downline</span>' : p.node.isRoot ? '<span class="disc-badge root">\u{1F4E3} everyone</span>' : p.node.isSelf ? '<span class="disc-badge self">your line</span>' : '<span class="disc-badge up">\u2B06 upline</span>';
      const el = document.createElement("div");
      el.className = "disc-post";
      el.innerHTML = `<div class="disc-post-head">${nameChip(p.authorPubKeyHex)} ${discIdentityBadge(p.authorPubKeyHex, ctx)} ${pos}${p.sentAt ? ` \xB7 \u{1F552} ${escapeHtml(fmtTime(p.sentAt))}` : ""}</div><div class="disc-post-text">${escapeHtml(p.text)}</div>`;
      feedEl.append(el);
    }
  }
  async function onCheckUpdates() {
    const host = $("updatesFeed");
    const held = [...new Set(store2.active().map((t) => t.collectionId))];
    if (held.length === 0) {
      host.innerHTML = '<p class="muted">No collections held yet \u2014 buy or mint an edition to receive publisher updates.</p>';
      return;
    }
    host.innerHTML = '<p class="muted">Checking for updates\u2026</p>';
    const feed = [];
    for (const collectionId of held) {
      try {
        const info = await loadCollection(collectionId);
        if (!info.publisherPubKeyHex) continue;
        const list = await resolveBroadcasts(provider, info.publisherPubKeyHex, collectionId);
        if (list.length > 0) latestBroadcast.set(collectionId, list[0]);
        for (const b of list) feed.push({ ...b, name: info.name, publisherPubKeyHex: info.publisherPubKeyHex });
      } catch {
      }
    }
    feed.sort((a, b) => (b.height || 1e12) - (a.height || 1e12));
    applyLatestAliases(feed.map((b) => ({ pk: b.publisherPubKeyHex, alias: b.senderAlias })));
    renderTokens();
    renderUpdatesFeed(feed);
    resolveAvatarsThen(feed.map((b) => b.publisherPubKeyHex), () => {
      if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed);
    });
  }
  function renderUpdatesFeed(feed) {
    lastUpdatesFeed = feed;
    const host = $("updatesFeed");
    if (feed.length === 0) {
      host.innerHTML = '<p class="muted">No announcements yet from the publishers of your collections.</p>';
      return;
    }
    host.innerHTML = feed.map(
      (b) => `<div class="token msg"><div class="token-name">\u{1F4E3} ${escapeHtml(b.name || "Collection")}</div><div class="mono" style="font-size:12px">by ${nameChip(b.publisherPubKeyHex, { save: true })}</div><div class="state" style="color:var(--accent);white-space:pre-wrap">${escapeHtml(b.text)}</div><div class="mono">${short(b.txId)}</div></div>`
    ).join("");
  }
  function activateTab(name) {
    const navBtn = document.querySelector(`.tab[data-tab="${name}"]`);
    if (isWatchOnly() && navBtn?.hasAttribute("data-needs-key")) name = "wallet";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    document.querySelectorAll(".tabpanel").forEach((p) => p.classList.toggle("is-active", p.id === `tab-${name}`));
    try {
      localStorage.setItem("p2:activeTab", name);
    } catch {
    }
    if (name === "discussions" && discAnchor == null) renderDiscRooms();
    if (name === "sales") void renderSalesTab();
  }
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    tabs.forEach((t) => {
      t.onclick = () => activateTab(t.dataset.tab);
    });
    document.querySelectorAll("[data-goto]").forEach((el) => {
      el.onclick = () => activateTab(el.dataset.goto);
    });
    let saved = null;
    try {
      saved = localStorage.getItem("p2:activeTab");
    } catch {
    }
    if (saved && tabs.some((t) => t.dataset.tab === saved)) activateTab(saved);
  }
  function init() {
    store2 = new PharLapStore();
    const ver = $("appVersion");
    if (ver != null) ver.textContent = `Smart NFTs \xB7 v${"0.1"} \xB7 ${"c1277e1"} \xB7 ${"2026-09-11"}`;
    loadAliases();
    const watch = localStorage.getItem(WATCH_KEY);
    if (watch != null) {
      try {
        useWatchKey(watch);
      } catch {
        localStorage.removeItem(WATCH_KEY);
        useKey(loadKey());
      }
    } else useKey(loadKey());
    try {
      if (localStorage.getItem("p2:nftview") === "grid") nftView = "grid";
    } catch {
    }
    try {
      if (localStorage.getItem("p2:nftsort") === "publisher") nftSort = "publisher";
    } catch {
    }
    updateViewToggle();
    updateSortToggle();
    renderTokens();
    initTabs();
    document.addEventListener("click", onCopyClick);
    document.addEventListener("click", onAliasSaveClick);
    $("myAlias").value = getMyAlias() ? "@" + getMyAlias() : "";
    $("btnSaveAlias").onclick = () => {
      const a = val("myAlias").replace(/^@+/, "").trim();
      setMyAlias(a);
      $("myAlias").value = a ? "@" + a : "";
      toast(a ? `Your alias is now @${a}` : "Alias cleared");
    };
    $("btnViewList").onclick = () => setNftView("list");
    $("btnViewGrid").onclick = () => setNftView("grid");
    $("btnSortRecent").onclick = () => setNftSort("recent");
    $("btnSortPublisher").onclick = () => setNftSort("publisher");
    $("btnDiscRefresh").onclick = () => {
      if (discAnchor != null) void loadDiscThread(discAnchor);
      else renderDiscRooms();
    };
    $("btnSales").onclick = () => activateTab("sales");
    $("btnSalesRefresh").onclick = () => void renderSalesTab(true);
    $("tokenModalClose").onclick = () => closeTokenModal();
    $("tokenModal").addEventListener("click", (e) => {
      if (e.target === $("tokenModal")) closeTokenModal();
    });
    $("tokenModalBody").addEventListener("click", (e) => {
      if (e.target.closest("button") != null) $("tokenModal").style.display = "none";
    }, true);
    $("btnRefresh").onclick = () => void refreshBalance();
    $("btnBuyBsv").onclick = () => onBuyBsv();
    $("btnSaveAff").onclick = () => onSaveAff();
    renderAffField();
    wireScanButtons();
    $("btnMint").onclick = () => void onMint();
    $("btnMintEdition").onclick = () => void onMintEdition();
    $("btnTierUnlimited").onclick = () => setPublishTier("unlimited");
    $("btnTierLimited").onclick = () => setPublishTier("limited");
    $("btnTierExclusive").onclick = () => setPublishTier("exclusive");
    {
      const lic = $("edLicense");
      const custom = $("edLicenseCustom");
      if (lic != null && custom != null) lic.onchange = () => {
        custom.hidden = lic.value !== "__custom";
      };
    }
    ;
    $("edCombine").onchange = () => {
      const on = $("edCombine").checked;
      $("edCombineWrap").hidden = !on;
      $("edFile").disabled = on;
      const enc = $("edEncrypt");
      enc.disabled = on;
      if (on) enc.checked = false;
      if (on) renderCombinePicker();
    };
    $("edCover").onchange = () => void onCoverSelected();
    $("edCoverCam").onclick = () => void onTakePhoto();
    $("btnFeeFixed").onclick = () => setFeeMode("fixed");
    $("btnFeePct").onclick = () => setFeeMode("pct");
    $("edPrice").addEventListener("input", updateFeePctPreview);
    $("edResellerPct").addEventListener("input", updateFeePctPreview);
    $("edBond").addEventListener("input", updateFeePctPreview);
    $("btnIncoming").onclick = () => void onCheckIncoming();
    $("btnSendMessage").onclick = () => void onSendMessage();
    $("btnCheckMessages").onclick = () => void onCheckMessages();
    $("msgTo").addEventListener("input", updateMsgToName);
    $("btnContacts").onclick = () => openContactsModal();
    $("btnPublishProfile").onclick = () => void onPublishProfile();
    $("contactsClose").onclick = () => closeContactsModal();
    $("contactsModal").addEventListener("click", (e) => {
      if (e.target === $("contactsModal")) closeContactsModal();
    });
    $("contactAdd").onclick = () => onAddContact();
    $("btnCfgBackup").onclick = () => void onConfigBackup();
    $("btnCfgRestore").onclick = () => void onConfigRestore();
    $("btnCheckUpdates").onclick = () => void onCheckUpdates();
    $("btnNewWallet").onclick = () => {
      if (!confirm("Replace the current wallet with a new one? Back up the current wallet first (its seed phrase / WIF is above) \u2014 it will be replaced.")) return;
      const { mnemonic, key: key2 } = newSeedWallet();
      switchWallet(key2, false, mnemonic);
      setStatus("New wallet created \u2014 back up your seed phrase!", "ok");
      localStorage.removeItem(BACKED_UP_KEY);
      showSeedModal(mnemonic);
    };
    $("btnRestore").onclick = () => {
      let k;
      try {
        k = Signer.fromWif(val("restoreWif"));
      } catch {
        setStatus("Invalid WIF.", "error");
        return;
      }
      switchWallet(k, true);
    };
    $("btnRestoreSeed").onclick = () => {
      let k;
      const phrase = val("restoreSeed").trim().replace(/\s+/g, " ");
      try {
        k = keyFromMnemonic(phrase);
      } catch {
        setStatus("Invalid seed phrase \u2014 check the words and order.", "error");
        return;
      }
      switchWallet(k, true, phrase);
      markBackedUp();
      $("restoreSeed").value = "";
      setStatus("Wallet restored from seed phrase \u2014 recovering from chain\u2026", "ok");
    };
    $("btnWatchLoad").onclick = () => {
      const pk = val("watchPubKey");
      try {
        switchToWatch(pk);
      } catch {
        setStatus("Enter a valid public key (33- or 65-byte hex) from your offline wallet.", "error");
        return;
      }
      ;
      $("watchPubKey").value = "";
      setStatus("Watch-only wallet loaded. Signing actions are disabled here \u2014 sign on your offline machine.", "ok");
    };
    $("btnWatchExit").onclick = () => {
      if (!confirm("Leave watch-only mode? This creates a fresh local wallet on this device (your watched wallet is unaffected \u2014 re-load it any time with its public key).")) return;
      const { mnemonic, key: key2 } = newSeedWallet();
      switchWallet(key2, false, mnemonic);
      setStatus("Exited watch-only \u2014 a fresh local wallet was created. Back up its seed phrase.", "ok");
      localStorage.removeItem(BACKED_UP_KEY);
      showSeedModal(mnemonic);
    };
    $("btnSendBsv").onclick = () => void onSendBsv();
    $("btnSendBsvExport").onclick = () => void onSendBsvExport();
    $("sendBsvMax").addEventListener("change", () => {
      const max = $("sendBsvMax").checked;
      const amt = $("sendBsvAmount");
      amt.disabled = max;
      if (max) amt.value = "";
    });
    $("advAirgap").addEventListener("toggle", () => {
      if ($("advAirgap").open) populateAirgapEditions();
    });
    document.querySelectorAll('input[name="agAction"]').forEach((r) => r.addEventListener("change", syncAirgapAction));
    $("btnAgExport").onclick = () => void onAirgapExport();
    $("agSignFile").addEventListener("change", () => void onAirgapSignFile());
    $("btnAgSign").onclick = () => void onAirgapSign();
    $("btnAgBroadcast").onclick = () => void onAirgapBroadcast();
    $("btnCsRead").onclick = () => void onCosignRead();
    $("btnCsSign").onclick = () => void onCosignSign();
    $("btnCsBroadcast").onclick = () => void onCosignBroadcast();
    $("btnSeedShow").onclick = () => toggleSeed();
    $("btnSeedCopy").onclick = () => void navigator.clipboard?.writeText($("seedPhrase").value);
    $("btnCopyPub").onclick = () => void navigator.clipboard?.writeText(pubKeyHex);
    $("btnCopyAddr").onclick = () => void navigator.clipboard?.writeText(address);
    $("btnQrAddr").onclick = () => showQrModal("Receive address \u2014 BSV only", address);
    $("btnQrPub").onclick = () => showQrModal("Public key \u2014 scan to share", pubKeyHex);
    $("btnWifShow").onclick = () => {
      const el = $("wif");
      const showing = el.type === "text";
      el.type = showing ? "password" : "text";
      $("btnWifShow").textContent = showing ? "\u{1F441} Show" : "\u{1F648} Hide";
    };
    $("btnWifCopy").onclick = () => {
      void navigator.clipboard?.writeText($("wif").value);
      const b = $("btnWifCopy");
      const prev = b.textContent;
      b.textContent = "Copied \u2713";
      setTimeout(() => {
        b.textContent = prev;
      }, 1200);
    };
    $("viewerClose").onclick = () => closeViewer();
    $("viewer").onclick = (e) => {
      if (e.target === $("viewer")) closeViewer();
    };
    $("cvWallet").onclick = () => closeCollectionView();
    $("cvShare").onclick = () => void shareCollectionLink();
    $("cvQr").onclick = () => void (async () => {
      const l = await currentShareLink();
      if (l) showQrModal("Scan to open this sales page", l);
    })();
    $("cvGet").onclick = () => void onGetCopy();
    $("cvGetTop").onclick = () => {
      document.querySelector(".cv-buy")?.scrollIntoView({ behavior: "smooth", block: "center" });
      void onGetCopy();
    };
    $("cvBuyAnother").onclick = () => {
      if (!currentCollection) return;
      if (confirm(`You already own a copy of \u201C${currentCollection.info.name}\u201D.

Buy ANOTHER copy?`)) void onGetCopy();
    };
    $("cvView").onclick = () => {
      if (currentCollection) void onView(currentCollection.info.tx1Ref, currentCollection.info.name);
    };
    $("cvNoteSave").onclick = () => void onSaveSellerNote();
    $("cvNoteRefresh").onclick = () => void onRefreshNote();
    $("cvFundCopy").onclick = () => void navigator.clipboard?.writeText(address);
    $("cvFundDone").onclick = () => void onGetCopy();
    window.addEventListener("hashchange", () => {
      const r = parseHashRoute();
      if (r) void openCollectionView(r.c, r.h, r.g, r.src);
      else closeCollectionView();
    });
    const listParam = new URLSearchParams(location.hash.replace(/^#/, "")).get("list");
    if (listParam && /^0[23][0-9a-f]{64}$/.test(listParam.toLowerCase())) {
      pendingListPartner = listParam.toLowerCase();
      activateTab("tokens");
      setStatus(`\u{1F4E4} Listing to ${short(pendingListPartner)} \u2014 tap \u201C\u{1F91D} Onboard partner\u201D on a collection below to send it a copy for resale.`);
      history.replaceState(null, "", location.pathname + location.search);
    }
    const route = parseHashRoute();
    if (route) void openCollectionView(route.c, route.h, route.g, route.src);
    void refreshBalance();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
//# sourceMappingURL=testbundle2.js.map
