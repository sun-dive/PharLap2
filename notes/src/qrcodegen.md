# src/qrcodegen.js

Vendored: Project Nayuki QR Code generator (MIT). Used only by the browser bundle (esbuild handles the
TS namespace); not imported by node --test. Wrapped by qr.ts. See license header above.

## namespace qrcodegen

At `class QrCode {`:

---- QR Code symbol class ----

At `class QrCode {`:

A QR Code symbol, which is a type of two-dimension barcode.
Invented by Denso Wave and described in the ISO/IEC 18004 standard.
Instances of this class represent an immutable square grid of dark and light cells.
The class provides static factory functions to create a QR Code from text or binary data.
The class covers the QR Code Model 2 specification, supporting all versions (sizes)
from 1 to 40, all 4 error correction levels, and 4 character encoding modes.

Ways to create a QR Code object:
- High level: Take the payload data and call QrCode.encodeText() or QrCode.encodeBinary().
- Mid level: Custom-make the list of segments and call QrCode.encodeSegments().
- Low level: Custom-make the array of data codeword bytes (including
  segment headers and final padding, excluding error correction codewords),
  supply the appropriate version number, and call the QrCode() constructor.
(Note that all ways require supplying the desired error correction level.)

At `class QrSegment {`:

---- Data segment class ----

At `class QrSegment {`:

A segment of character/binary/control data in a QR Code symbol.
Instances of this class are immutable.
The mid-level way to create a segment is to take the payload data
and call a static factory function such as QrSegment.makeNumeric().
The low-level way to create a segment is to custom-make the bit buffer
and call the QrSegment() constructor with appropriate values.
This segment class imposes no length restrictions, but QR Codes have restrictions.
Even in the most favorable conditions, a QR Code can only hold 7089 characters of data.
Any segment longer than this is meaningless for the purpose of generating QR Codes.

### QrCode.encodeText

```ts
public static encodeText(text: string, ecl: QrCode.Ecc): QrCode
```

-- Static factory functions (high level) --

Returns a QR Code representing the given Unicode text string at the given error correction level.
As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
Unicode code points (not UTF-16 code units) if the low error correction level is used. The smallest possible
QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
ecl argument if it can be done without increasing the version.

### QrCode.encodeBinary

```ts
public static encodeBinary(data: Readonly<Array<byte>>, ecl: QrCode.Ecc): QrCode
```

Returns a QR Code representing the given binary data at the given error correction level.
This function always encodes using the binary segment mode, not any text mode. The maximum number of
bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.

### QrCode.encodeSegments

```ts
public static encodeSegments(segs: Readonly<Array<QrSegment>>, ecl: QrCode.Ecc,
				minVersion: int = 1, maxVersion: int = 40,
				mask: int = -1, boostEcl: boolean = true): QrCode
```

-- Static factory functions (mid level) --

Returns a QR Code representing the given segments with the given encoding parameters.
The smallest possible QR Code version within the given range is automatically
chosen for the output. Iff boostEcl is true, then the ECC level of the result
may be higher than the ecl argument if it can be done without increasing the
version. The mask number is either between 0 to 7 (inclusive) to force that
mask, or -1 to automatically choose an appropriate mask (which may be slow).
This function allows the user to create a custom sequence of segments that switches
between modes (such as alphanumeric and byte) to encode text in less space.
This is a mid-level API; the high-level API is encodeText() and encodeBinary().

At `let version;`:

Find the minimal version number to use

At `const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;`:

Number of data bits available

At `break;`:

This version number is found to be suitable

At `if (version >= maxVersion)`:

All versions in the range could not fit the given data

At `for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) {`:

Increase the error correction level while the data still fits in the current version number

At `for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) {`:

From low to high

At `let bb = []`:

Concatenate all segments to create the data bit string

At `const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;`:

Add terminator and pad up to a byte if applicable

At `for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)`:

Pad with alternating bytes until data capacity is reached

At `let dataCodewords = [];`:

Pack bits into bytes in big endian

At `return new QrCode(version, ecl, dataCodewords, mask);`:

Create the QR Code object

### QrCode.size

```ts
public readonly size: int;
```

-- Fields --

The width and height of this QR Code, measured in modules, between
21 and 177 (inclusive). This is equal to version * 4 + 17.

### QrCode.mask

```ts
public readonly mask: int;
```

The index of the mask pattern used in this QR Code, which is between 0 and 7 (inclusive).
Even if a QR Code is created with automatic masking requested (mask = -1),
the resulting object still has a mask value between 0 and 7.

### QrCode.modules

```ts
private readonly modules   : Array<Array<boolean>> = [];
```

The modules of this QR Code (false = light, true = dark).
Immutable after constructor finishes. Accessed through getModule().

### QrCode.isFunction

```ts
private readonly isFunction: Array<Array<boolean>> = [];
```

Indicates function modules that are not subjected to masking. Discarded when constructor finishes.

### QrCode.constructor

```ts
public constructor(
				// The version number of this QR Code, which is between 1 and 40 (inclusive).
				// This determines the size of this barcode.
				public readonly version: int,

				// The error correction level used in this QR Code.
				public readonly errorCorrectionLevel: QrCode.Ecc,

				dataCodewords: Readonly<Array<byte>>,

				msk: int)
```

-- Constructor (low level) and fields --

Creates a new QR Code with the given version number,
error correction level, data codeword bytes, and mask number.
This is a low-level API that most users should not use directly.
A mid-level API is the encodeSegments() function.

At `if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION)`:

Check scalar arguments

At `let row = [];`:

Initialize both grids to be size*size arrays of Boolean false

At `this.modules   .push(row.slice());`:

Initially all light

At `this.drawFunctionPatterns();`:

Compute ECC, draw modules

At `if (msk == -1) {`:

Do masking

At `if (msk == -1) {`:

Automatically choose best mask

At `this.applyMask(i);`:

Undoes the mask due to XOR

At `this.applyMask(msk);`:

Apply the final choice of mask

At `this.drawFormatBits(msk);`:

Overwrite old format bits

### QrCode.getModule

```ts
public getModule(x: int, y: int): boolean
```

-- Accessor methods --

Returns the color of the module (pixel) at the given coordinates, which is false
for light or true for dark. The top left corner has the coordinates (x=0, y=0).
If the given coordinates are out of bounds, then false (light) is returned.

### QrCode.drawFunctionPatterns

```ts
private drawFunctionPatterns(): void
```

-- Private helper methods for constructor: Drawing function modules --

Reads this object's version field, and draws and marks all function modules.

At `for (let i = 0; i < this.size; i++) {`:

Draw horizontal and vertical timing patterns

At `this.drawFinderPattern(3, 3);`:

Draw 3 finder patterns (all corners except bottom right; overwrites some timing modules)

At `const alignPatPos = this.getAlignmentPatternPositions();`:

Draw numerous alignment patterns

At `if (!(i == 0 && j == 0 || i == 0 && j == numAlign - 1 || i == numAlign - 1 && j == 0))`:

Don't draw on the three finder corners

At `this.drawFormatBits(0);`:

Draw configuration data

At `this.drawFormatBits(0);`:

Dummy mask value; overwritten later in the constructor

### QrCode.drawFormatBits

```ts
private drawFormatBits(mask: int): void
```

Draws two copies of the format bits (with its own error correction code)
based on the given mask and this object's error correction level field.

At `const data = this.errorCorrectionLevel.formatBits << 3 | mask;`:

Calculate error correction code and pack bits

At `const data = this.errorCorrectionLevel.formatBits << 3 | mask;`:

errCorrLvl is uint2, mask is uint3

At `const bits = (data << 10 | rem) ^ 0x5412;`:

uint15

At `for (let i = 0; i <= 5; i++)`:

Draw first copy

At `for (let i = 0; i < 8; i++)`:

Draw second copy

At `this.setFunctionModule(8, this.size - 8, true);`:

Always dark

### QrCode.drawVersion

```ts
private drawVersion(): void
```

Draws two copies of the version bits (with its own error correction code),
based on this object's version field, iff 7 <= version <= 40.

At `let rem = this.version;`:

Calculate error correction code and pack bits

At `let rem = this.version;`:

version is uint6, in the range [7, 40]

At `const bits = this.version << 12 | rem;`:

uint18

At `for (let i = 0; i < 18; i++) {`:

Draw two copies

### QrCode.drawFinderPattern

```ts
private drawFinderPattern(x: int, y: int): void
```

Draws a 9*9 finder pattern including the border separator,
with the center module at (x, y). Modules can be out of bounds.

At `const dist = Math.max(Math.abs(dx), Math.abs(dy));`:

Chebyshev/infinity norm

### QrCode.drawAlignmentPattern

```ts
private drawAlignmentPattern(x: int, y: int): void
```

Draws a 5*5 alignment pattern, with the center module
at (x, y). All modules must be in bounds.

### QrCode.setFunctionModule

```ts
private setFunctionModule(x: int, y: int, isDark: boolean): void
```

Sets the color of a module and marks it as a function module.
Only used by the constructor. Coordinates must be in bounds.

### QrCode.addEccAndInterleave

```ts
private addEccAndInterleave(data: Readonly<Array<byte>>): Array<byte>
```

-- Private helper methods for constructor: Codewords and masking --

Returns a new byte string representing the given data with the appropriate error correction
codewords appended to it, based on this object's version and error correction level.

At `const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];`:

Calculate parameter numbers

At `let blocks = [];`:

Split data into blocks and append ECC to each block

At `let result = [];`:

Interleave (not concatenate) the bytes from every block into a single sequence

At `if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)`:

Skip the padding byte in short blocks

### QrCode.drawCodewords

```ts
private drawCodewords(data: Readonly<Array<byte>>): void
```

Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
data area of this QR Code. Function modules need to be marked off before this is called.

At `let i = 0;`:

Bit index into the data

At `for (let right = this.size - 1; right >= 1; right -= 2) {`:

Do the funny zigzag scan

At `for (let right = this.size - 1; right >= 1; right -= 2) {`:

Index of right column in each column pair

At `for (let vert = 0; vert < this.size; vert++) {`:

Vertical counter

At `const x = right - j;`:

Actual x coordinate

At `const y = upward ? this.size - 1 - vert : vert;`:

Actual y coordinate

At `}`:

If this QR Code has any remainder bits (0 to 7), they were assigned as
0/false/light by the constructor and are left unchanged by this method

### QrCode.applyMask

```ts
private applyMask(mask: int): void
```

XORs the codeword modules in this QR Code with the given mask pattern.
The function modules must be marked and the codeword bits must be drawn
before masking. Due to the arithmetic of XOR, calling applyMask() with
the same mask value a second time will undo the mask. A final well-formed
QR Code needs exactly one (not zero, two, etc.) mask applied.

### QrCode.getPenaltyScore

```ts
private getPenaltyScore(): int
```

Calculates and returns the penalty score based on state of this QR Code's current modules.
This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.

At `for (let y = 0; y < this.size; y++) {`:

Adjacent modules in row having same color, and finder-like patterns

At `for (let x = 0; x < this.size; x++) {`:

Adjacent modules in column having same color, and finder-like patterns

At `for (let y = 0; y < this.size - 1; y++) {`:

2*2 blocks of modules having same color

At `let dark = 0;`:

Balance of dark and light modules

At `const total = this.size * this.size;`:

Note that size is odd, so dark/total != 1/2

At `const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;`:

Compute the smallest integer k >= 0 such that (45-5k)% <= dark/total <= (55+5k)%

At `assert(0 <= result && result <= 2568888);`:

Non-tight upper bound based on default values of PENALTY_N1, ..., N4

### QrCode.getAlignmentPatternPositions

```ts
private getAlignmentPatternPositions(): Array<int>
```

-- Private helper functions --

Returns an ascending list of positions of alignment patterns for this version number.
Each position is in the range [0,177), and are used on both the x and y axes.
This could be implemented as lookup table of 40 variable-length lists of integers.

### QrCode.getNumRawDataModules

```ts
private static getNumRawDataModules(ver: int): int
```

Returns the number of data bits that can be stored in a QR Code of the given version number, after
all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.

### QrCode.getNumDataCodewords

```ts
private static getNumDataCodewords(ver: int, ecl: QrCode.Ecc): int
```

Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
QR Code of the given version number and error correction level, with remainder bits discarded.
This stateless pure function could be implemented as a (40*4)-cell lookup table.

### QrCode.reedSolomonComputeDivisor

```ts
private static reedSolomonComputeDivisor(degree: int): Array<byte>
```

Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
implemented as a lookup table over all possible parameter values, instead of as an algorithm.

At `let result = [];`:

Polynomial coefficients are stored from highest to lowest power, excluding the leading term which is always 1.
For example the polynomial x^3 + 255x^2 + 8x + 93 is stored as the uint8 array [255, 8, 93].

At `result.push(1);`:

Start off with the monomial x^0

At `let root = 1;`:

Compute the product polynomial (x - r^0) * (x - r^1) * (x - r^2) * ... * (x - r^{degree-1}),
and drop the highest monomial term which is always 1x^degree.
Note that r = 0x02, which is a generator element of this field GF(2^8/0x11D).

At `for (let j = 0; j < result.length; j++) {`:

Multiply the current product by (x - r^i)

### QrCode.reedSolomonComputeRemainder

```ts
private static reedSolomonComputeRemainder(data: Readonly<Array<byte>>, divisor: Readonly<Array<byte>>): Array<byte>
```

Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.

At `for (const b of data) {`:

Polynomial division

### QrCode.reedSolomonMultiply

```ts
private static reedSolomonMultiply(x: byte, y: byte): byte
```

Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
are unsigned 8-bit integers. This could be implemented as a lookup table of 256*256 entries of uint8.

At `let z = 0;`:

Russian peasant multiplication

### QrCode.finderPenaltyCountPatterns

```ts
private finderPenaltyCountPatterns(runHistory: Readonly<Array<int>>): int
```

Can only be called immediately after a light run is added, and
returns either 0, 1, or 2. A helper function for getPenaltyScore().

### QrCode.finderPenaltyTerminateAndCount

```ts
private finderPenaltyTerminateAndCount(currentRunColor: boolean, currentRunLength: int, runHistory: Array<int>): int
```

Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().

At `if (currentRunColor) {`:

Terminate dark run

At `currentRunLength += this.size;`:

Add light border to final run

### QrCode.finderPenaltyAddHistory

```ts
private finderPenaltyAddHistory(currentRunLength: int, runHistory: Array<int>): void
```

Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().

At `currentRunLength += this.size;`:

Add light border to initial run

### QrCode.MIN_VERSION

```ts
public static readonly MIN_VERSION: int =  1;
```

-- Constants and tables --

The minimum version number supported in the QR Code Model 2 standard.

### QrCode.MAX_VERSION

```ts
public static readonly MAX_VERSION: int = 40;
```

The maximum version number supported in the QR Code Model 2 standard.

### QrCode.PENALTY_N1

```ts
private static readonly PENALTY_N1: int =  3;
```

For use in getPenaltyScore(), when evaluating which mask is best.

### QrCode.ECC_CODEWORDS_PER_BLOCK

```ts
private static readonly ECC_CODEWORDS_PER_BLOCK: Array<Array<int>> = [
```

At `[-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, ...`:

Version: (note that index 0 is for padding, and is set to an illegal value)
0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level

At `[-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, ...`:

Low

At `[-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, ...`:

Medium

At `[-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, ...`:

Quartile

At `[-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, ...`:

High

### QrCode.NUM_ERROR_CORRECTION_BLOCKS

```ts
private static readonly NUM_ERROR_CORRECTION_BLOCKS: Array<Array<int>> = [
```

At `[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12...`:

Version: (note that index 0 is for padding, and is set to an illegal value)
0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level

At `[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12...`:

Low

At `[-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23...`:

Medium

At `[-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34...`:

Quartile

At `[-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37...`:

High

### namespace qrcodegen › appendBits

```ts
function appendBits(val: int, len: int, bb: Array<bit>): void
```

Appends the given number of low-order bits of the given value
to the given buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.

At `for (let i = len - 1; i >= 0; i--)`:

Append bit by bit

### namespace qrcodegen › getBit

```ts
function getBit(x: int, i: int): boolean
```

Returns true iff the i'th bit of x is set to 1.

### namespace qrcodegen › assert

```ts
function assert(cond: boolean): void
```

Throws an exception if the given condition is false.

### QrSegment.makeBytes

```ts
public static makeBytes(data: Readonly<Array<byte>>): QrSegment
```

-- Static factory functions (mid level) --

Returns a segment representing the given binary data encoded in
byte mode. All input byte arrays are acceptable. Any text string
can be converted to UTF-8 bytes and encoded as a byte mode segment.

### QrSegment.makeNumeric

```ts
public static makeNumeric(digits: string): QrSegment
```

Returns a segment representing the given string of decimal digits encoded in numeric mode.

At `for (let i = 0; i < digits.length; ) {`:

Consume up to 3 digits per iteration

### QrSegment.makeAlphanumeric

```ts
public static makeAlphanumeric(text: string): QrSegment
```

Returns a segment representing the given text string encoded in alphanumeric mode.
The characters allowed are: 0 to 9, A to Z (uppercase only), space,
dollar, percent, asterisk, plus, hyphen, period, slash, colon.

At `for (i = 0; i + 2 <= text.length; i += 2) {`:

Process groups of 2

At `if (i < text.length)`:

1 character remaining

### QrSegment.makeSegments

```ts
public static makeSegments(text: string): Array<QrSegment>
```

Returns a new mutable list of zero or more segments to represent the given Unicode text string.
The result may use various segment modes and switch modes to optimize the length of the bit stream.

At `if (text == "")`:

Select the most efficient segment encoding automatically

### QrSegment.makeEci

```ts
public static makeEci(assignVal: int): QrSegment
```

Returns a segment representing an Extended Channel Interpretation
(ECI) designator with the given assignment value.

### QrSegment.isNumeric

```ts
public static isNumeric(text: string): boolean
```

Tests whether the given string can be encoded as a segment in numeric mode.
A string is encodable iff each character is in the range 0 to 9.

### QrSegment.isAlphanumeric

```ts
public static isAlphanumeric(text: string): boolean
```

Tests whether the given string can be encoded as a segment in alphanumeric mode.
A string is encodable iff each character is in the following set: 0 to 9, A to Z
(uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.

### QrSegment.constructor

```ts
public constructor(
				// The mode indicator of this segment.
				public readonly mode: QrSegment.Mode,

				// The length of this segment's unencoded data. Measured in characters for
				// numeric/alphanumeric/kanji mode, bytes for byte mode, and 0 for ECI mode.
				// Always zero or positive. Not the same as the data's bit length.
				public readonly numChars: int,

				// The data bits of this segment. Accessed through getData().
				private readonly bitData: Array<bit>)
```

-- Constructor (low level) and fields --

Creates a new QR Code segment with the given attributes and data.
The character count (numChars) must agree with the mode and the bit buffer length,
but the constraint isn't checked. The given bit buffer is cloned and stored.

At `this.bitData = bitData.slice();`:

Make defensive copy

### QrSegment.getData

```ts
public getData(): Array<bit>
```

-- Methods --

Returns a new copy of the data bits of this segment.

At `return this.bitData.slice();`:

Make defensive copy

### QrSegment.getTotalBits

```ts
public static getTotalBits(segs: Readonly<Array<QrSegment>>, version: int): number
```

(Package-private) Calculates and returns the number of bits needed to encode the given segments at
the given version. The result is infinity if a segment has too many characters to fit its length field.

At `return Infinity;`:

The segment's length doesn't fit the field's bit width

### QrSegment.toUtf8ByteArray

```ts
private static toUtf8ByteArray(str: string): Array<byte>
```

Returns a new array of bytes representing the given string encoded in UTF-8.

### QrSegment.NUMERIC_REGEX

```ts
private static readonly NUMERIC_REGEX: RegExp = /^[0-9]*$/;
```

-- Constants --

Describes precisely all strings that are encodable in numeric mode.

### QrSegment.ALPHANUMERIC_REGEX

```ts
private static readonly ALPHANUMERIC_REGEX: RegExp = /^[A-Z0-9 $%*+.\/:-]*$/;
```

Describes precisely all strings that are encodable in alphanumeric mode.

### QrSegment.ALPHANUMERIC_CHARSET

```ts
private static readonly ALPHANUMERIC_CHARSET: string = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
```

The set of all legal characters in alphanumeric mode,
where each character value maps to the index in the string.

## namespace qrcodegen

---- Public helper enumeration ----

At `class Ecc {`:

The error correction level in a QR Code symbol. Immutable.

### Ecc.LOW

```ts
public static readonly LOW      = new Ecc(0, 1);
```

-- Constants --

### Ecc.MEDIUM

```ts
public static readonly MEDIUM   = new Ecc(1, 0);
```

The QR Code can tolerate about  7% erroneous codewords

### Ecc.QUARTILE

```ts
public static readonly QUARTILE = new Ecc(2, 3);
```

The QR Code can tolerate about 15% erroneous codewords

### Ecc.HIGH

```ts
public static readonly HIGH     = new Ecc(3, 2);
```

The QR Code can tolerate about 25% erroneous codewords

### Ecc.constructor

```ts
private constructor(
			// In the range 0 to 3 (unsigned 2-bit integer).
			public readonly ordinal: int,
			// (Package-private) In the range 0 to 3 (unsigned 2-bit integer).
			public readonly formatBits: int)
```

The QR Code can tolerate about 30% erroneous codewords

-- Constructor and fields --

## namespace qrcodegen

---- Public helper enumeration ----

At `class Mode {`:

Describes how a segment's data bits are interpreted. Immutable.

### Mode.NUMERIC

```ts
public static readonly NUMERIC      = new Mode(0x1, [10, 12, 14]);
```

-- Constants --

### Mode.constructor

```ts
private constructor(
			// The mode indicator bits, which is a uint4 value (range 0 to 15).
			public readonly modeBits: int,
			// Number of character count bits for three different version ranges.
			private readonly numBitsCharCount: [int,int,int])
```

-- Constructor and fields --

### Mode.numCharCountBits

```ts
public numCharCountBits(ver: int): int
```

-- Method --

(Package-private) Returns the bit width of the character count field for a segment in
this mode in a QR Code at the given version number. The result is in the range [0, 16].
