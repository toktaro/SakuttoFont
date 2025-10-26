// === DOM要素の取得 ===
const imageLoader = document.getElementById('imageLoader');
const originalCanvas = document.getElementById('originalCanvas');
const previewCanvas = document.getElementById('previewCanvas');
const thresholdSlider = document.getElementById('threshold');
const thresholdValue = document.getElementById('thresholdValue');
const convertSvgBtn = document.getElementById('convertSvgBtn'); // SVG変換ボタン
const generateFontBtn = document.getElementById('generateFontBtn'); // フォント生成ボタン
const fontNameInput = document.getElementById('font-name-input');
const statusDiv = document.getElementById('status');

const originalCtx = originalCanvas.getContext('2d');
const previewCtx = previewCanvas.getContext('2d');

let currentImage = null; // プレビュー用の画像オブジェクト
let selectedFiles = [];  // 変換対象のファイルリスト

// === フォント設定 ===
const FONT_SETTINGS = {
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200
};

// === 初期化処理 ===
setDefaultFontName();

// === イベントリスナー ===

// ファイルが選択されたときの処理
imageLoader.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) {
        // UIリセット
        originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        currentImage = null;
        convertSvgBtn.disabled = true;
        generateFontBtn.disabled = true;
        updateStatus('', 'none');
        return;
    }

    // プレビュー表示
    const firstFile = selectedFiles[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            originalCanvas.width = previewCanvas.width = img.width;
            originalCanvas.height = previewCanvas.height = img.height;
            originalCtx.drawImage(img, 0, 0);
            updatePreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(firstFile);

    // ボタンを有効化
    convertSvgBtn.disabled = false;
    generateFontBtn.disabled = false;
    updateStatus('', 'none');
});

// しきい値スライダーが動いたときの処理
thresholdSlider.addEventListener('input', () => {
    thresholdValue.textContent = thresholdSlider.value;
    if (currentImage) {
        updatePreview();
    }
});

// --- ★★★ 「SVGに変換」ボタンが押されたときの処理 (復活) ★★★ ---
convertSvgBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        alert('先に画像を選択してください。');
        return;
    }

    const threshold = parseInt(thresholdSlider.value, 10);
    const outputSizeMode = document.querySelector('input[name="outputSize"]:checked').value;

    convertSvgBtn.disabled = true;
    generateFontBtn.disabled = true;

    try {
        if (selectedFiles.length === 1) {
            // --- 1ファイルの場合：直接ダウンロード ---
            convertSvgBtn.textContent = '変換中...';
            const result = await convertImageToSVGData(selectedFiles[0], threshold, outputSizeMode);
            const svgBlob = new Blob([result.svgContent], { type: 'image/svg+xml;charset=utf-8' });
            downloadBlob(svgBlob, result.fileName);
            alert('変換が完了しました。');
        } else {
            // --- 複数ファイルの場合：ZIPでダウンロード（直列処理） ---
            const results = [];
            let completedCount = 0;
            
            for (const file of selectedFiles) {
                completedCount++;
                convertSvgBtn.textContent = `SVG生成中... (${completedCount}/${selectedFiles.length})`;
                const result = await convertImageToSVGData(file, threshold, outputSizeMode);
                results.push(result);
            }

            convertSvgBtn.textContent = 'ZIP圧縮中...';
            const zip = new JSZip();
            results.forEach(result => {
                zip.file(result.fileName, result.svgContent);
            });

            const zipBlob = await zip.generateAsync({ type: "blob" });
            downloadBlob(zipBlob, "converted_svg_files.zip");
            alert(`${selectedFiles.length}件のファイルをZIPにまとめてダウンロードしました。`);
        }
    } catch (error) {
        console.error('SVG変換エラー:', error);
        alert('変換中にエラーが発生しました。コンソールを確認してください。');
    } finally {
        convertSvgBtn.disabled = false;
        generateFontBtn.disabled = false;
        convertSvgBtn.textContent = 'SVGに変換してダウンロード';
    }
});


// --- ★★★ 「フォントを生成」ボタンが押されたときの処理 ★★★ ---
generateFontBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        updateStatus('エラー: 画像ファイルが選択されていません。', 'error');
        return;
    }
    const familyName = fontNameInput.value.trim();
    if (familyName === "") {
        updateStatus('エラー: フォント名を入力してください。', 'error');
        return;
    }

    // 設定値を取得
    const threshold = parseInt(thresholdSlider.value, 10);
    const outputSizeMode = document.querySelector('input[name="outputSize"]:checked').value;
    const widthOption = document.querySelector('input[name="width-option"]:checked').value;

    updateStatus('フォント生成処理を開始します...', 'processing');
    convertSvgBtn.disabled = true;
    generateFontBtn.disabled = true;

    try {
        const glyphs = [];
        let completedCount = 0;

        // 1. 各画像ファイルをSVGに変換し、グリフを生成する
        for (const file of selectedFiles) {
            completedCount++;
            updateStatus(`処理中... (${completedCount}/${selectedFiles.length}): ${file.name}`, 'processing');
            
            // 画像 -> SVGデータオブジェクト
            const svgData = await convertImageToSVGData(file, threshold, outputSizeMode);
            
            // SVGデータ -> opentype.Glyph オブジェクト
            const glyph = createGlyphFromSvg(svgData.svgContent, file.name, widthOption);
            if (glyph) {
                glyphs.push(glyph);
            }
        }

        if (glyphs.length === 0) {
            throw new Error('有効なグリフを生成できませんでした。');
        }

        // 2. フォントを構築
        updateStatus('フォントファイルを構築中...', 'processing');
        const font = buildFont(glyphs, familyName);
        
        // 3. フォントファイルをダウンロード
        const arrayBuffer = font.toArrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'font/otf' });
        const fileName = familyName.replace(/\s/g, '-') + '.otf';
        downloadBlob(blob, fileName);
        
        updateStatus('フォントの生成が完了しました！', 'success');

    } catch (error) {
        console.error('フォント生成中にエラーが発生しました:', error);
        updateStatus(`エラー: ${error.message}`, 'error');
    } finally {
        convertSvgBtn.disabled = false;
        generateFontBtn.disabled = false;
    }
});


// === ヘルパー関数 ===

/**
 * プレビューを更新する関数
 */
function updatePreview() {
    if (!currentImage) return;
    const threshold = parseInt(thresholdSlider.value, 10);
    
    previewCtx.drawImage(currentImage, 0, 0);
    const imageData = previewCtx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const color = avg < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = color;
    }
    previewCtx.putImageData(imageData, 0, 0);
}

/**
 * 1つの画像ファイルをSVGデータオブジェクトに変換する非同期関数
 * @returns {Promise<{fileName: string, svgContent: string}>}
 */
function convertImageToSVGData(imageFile, threshold, outputSizeMode) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                
                const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = data[i + 1] = data[i + 2] = (avg < threshold ? 0 : 255);
                }
                tempCtx.putImageData(imageData, 0, 0);

                Potrace.loadImageFromUrl(tempCanvas.toDataURL(), () => {
                    Potrace.process(() => {
                        let scale = 1;
                        if (outputSizeMode === 'fixedHeight' && img.height > 0) {
                            scale = 1000 / img.height;
                        }
                        const svgContent = Potrace.getSVG(scale);
                        const originalFileName = imageFile.name;
                        const baseName = originalFileName.lastIndexOf('.') !== -1 ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : originalFileName;
                        const svgFileName = `${baseName}.svg`;
                        
                        resolve({ fileName: svgFileName, svgContent: svgContent });
                    });
                });
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(imageFile);
    });
}

/**
 * SVGテキストからopentype.Glyphオブジェクトを生成する
 */
function createGlyphFromSvg(svgText, fileName, widthOption) {
    // 実装は変更なし
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgNode = svgDoc.querySelector("svg");
    const pathNode = svgDoc.querySelector("path");
    if (!pathNode) { return null; }
    
    let character = fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
    character = character.normalize('NFC');

    const unicode = character.codePointAt(0);
    if (unicode === undefined) { return null; }
    
    const glyphName = "uni" + unicode.toString(16).toUpperCase().padStart(4, "0");
    const pathData = pathNode.getAttribute("d");
    const path = createTransformedPath(pathData, FONT_SETTINGS.ascender);
    
    let advanceWidth = 1000; // デフォルト/固定幅
    if (widthOption === 'svg' && svgNode) {
        const viewBox = svgNode.getAttribute("viewBox");
        const widthAttr = svgNode.getAttribute("width");
        if (viewBox) {
            const w = parseInt(viewBox.split(" ")[2], 10);
            if (!isNaN(w)) advanceWidth = w;
        } else if (widthAttr) {
            const w = parseInt(widthAttr, 10);
            if (!isNaN(w)) advanceWidth = w;
        }
    }

    return new opentype.Glyph({ name: glyphName, unicode: unicode, advanceWidth: advanceWidth, path: path });
}

/**
 * SVGのパスデータをOpenType.js用のパスに変換する
 */
function createTransformedPath(pathData, yOffset) {
    // 実装は変更なし
    const newPath = new opentype.Path();
    const commands = pathData.match(/[a-df-z][^a-df-z]*/ig);
    if (!commands) return newPath;
    commands.forEach(function (commandStr) {
        const command = commandStr[0];
        const points = commandStr.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(p => !isNaN(p));
        if (points.length === 0 && command.toLowerCase() !== 'z') return;
        let p = [];
        for (let i = 0; i < points.length; i += 2) {
            p.push({ x: points[i], y: yOffset - points[i + 1] });
        }
        if (command === 'M') newPath.moveTo(p[0].x, p[0].y);
        else if (command === 'L') newPath.lineTo(p[0].x, p[0].y);
        else if (command === 'C') newPath.curveTo(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y);
        else if (command.toLowerCase() === 'z') newPath.close();
    });
    return newPath;
}

/**
 * グリフの配列からフォントオブジェクトを構築する
 */
function buildFont(glyphs, familyName) {
    // .notdef (未定義文字) グリフを追加
    const notdefGlyph = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() });
    
    // space (空白) グリフを追加
    const spaceGlyph = new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() });
    
    // フォントオブジェクトをまず生成
    const font = new opentype.Font({
        familyName: familyName,
        styleName: 'Regular',
        unitsPerEm: FONT_SETTINGS.unitsPerEm,
        ascender: FONT_SETTINGS.ascender,
        descender: FONT_SETTINGS.descender,
        glyphs: [notdefGlyph, spaceGlyph, ...glyphs]
    });

    // 日本語グリフが含まれているかどうかのフラグ
    let containsJapanese = false;

    // グリフのUnicodeをチェックして日本語文字が含まれるか判定
    for (const glyph of glyphs) {
        if (glyph.unicode) {
            const unicode = glyph.unicode;
            // Unicodeの範囲で判定
            // 3040-309F: ひらがな
            // 30A0-30FF: カタカナ
            // 4E00-9FAF: CJK統合漢字
            // FF00-FFEF: 全角英数・記号など
            if ((unicode >= 0x3040 && unicode <= 0x309F) ||
                (unicode >= 0x30A0 && unicode <= 0x30FF) ||
                (unicode >= 0x4E00 && unicode <= 0x9FAF) ||
                (unicode >= 0xFF00 && unicode <= 0xFFEF)) {
                containsJapanese = true;
                break; // 1つでも見つかればチェック終了
            }
        }
    }

    // 日本語グリフが含まれている場合、各種メタ情報を追加
    if (containsJapanese) {
        // 1. metaテーブルにデザイン言語を設定
        console.log("日本語グリフが含まれているため、metaテーブルに 'dlng: Jpan' を設定します。");
        font.tables.meta = {
            'dlng': 'Jpan'
        };
        
        // 2. OS/2テーブルのCode Page RangeにJIS/Japan (Bit 17) を設定
        console.log("OS/2テーブルのCode Page RangeにJIS/Japan (Bit 17) を設定します。");
        // font.tables.os2 はライブラリによって自動生成されているため、
        // そのプロパティを直接、ビット演算子を使って変更します。
        // ulCodePageRange1 (ビット 0-31) の 17番目のビットを立てる。
        if (font.tables.os2) {
           // 既存の値に、JIS/JapanのビットをOR演算で追加
           font.tables.os2.ulCodePageRange1 |= (1 << 17);
        }
    }
    
    return font;
}

/**
 * Blobデータをダウンロードさせる
 */
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * ステータスメッセージを更新する
 */
function updateStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = "";
    if (type === "none") return;
    statusDiv.classList.add(`status-${type}`);
}

/**
 * デフォルトのフォント名を設定する
 */
function setDefaultFontName() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    fontNameInput.value = `MyFont ${yyyy}${mm}${dd}`;
}