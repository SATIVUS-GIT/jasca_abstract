// --- DOM要素の取得 ---
const docxUpload = document.getElementById('docx-upload');
const startCheckBtn = document.getElementById('start-check-btn');
const resultsDiv = document.getElementById('results');

let selectedFile = null; // 選択されたファイルを保持する変数

// --- イベントリスナーの設定 ---

// 1. ファイルが選択された時の処理
docxUpload.addEventListener('change', (event) => {
    selectedFile = event.target.files[0];
    
    if (selectedFile) {
        startCheckBtn.disabled = false; // ボタンを押せるようにする
        resultsDiv.innerHTML = '<p>ファイルが選択されました。チェックを開始してください。</p>';
    } else {
        startCheckBtn.disabled = true; // ファイルが選択解除されたらボタンを戻す
        resultsDiv.innerHTML = '<p>ファイルを選択してください...</p>';
    }
});

// 2. チェック開始ボタンが押された時の処理
startCheckBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    startCheckBtn.disabled = true; // 処理中はボタンを再度押せないようにする
    
    try {
        // checkDocx関数を実行し、完了を待つ
        const results = await checkDocx(selectedFile);
        // 完了したら結果を表示
        displayResults(results);

    } catch (error) {
        // checkDocx内でエラーが発生した場合
        console.error('DOCXの解析に失敗しました:', error);
        resultsDiv.innerHTML = `<p class="fail">✗ 解析エラー: ${error.message} ファイルが破損しているか、標準的でない.docxファイルの可能性があります。</p>`;
    } finally {
        // 成功しても失敗しても、ボタンを再度押せるように戻す
        startCheckBtn.disabled = false;
    }
});

/**
 * 進捗状況をUIに表示するヘルパー関数
 */
function updateProgress(message) {
    resultsDiv.innerHTML = `<p class="progress">${message}</p>`;
}

/**
 * .docxを解析し、チェック結果の配列を返すメイン関数
 * @param {File} file - アップロードされた.docxファイル
 * @returns {Promise<Array>} チェック結果の配列
 */
async function checkDocx(file) {
    updateProgress('ファイル (.docx) を読み込んでいます...');
    
    let results = []; // チェック結果
    
    // 1. .docx (zip) を読み込む
    const arrayBuffer = await file.arrayBuffer();
    updateProgress('ファイルを解凍しています...');
    const zip = await jszip.loadAsync(arrayBuffer);
    
    // 2. document.xml と styles.xml を取り出す
    const docFile = zip.file('word/document.xml');
    const styleFile = zip.file('word/styles.xml');

    if (!docFile || !styleFile) {
        throw new Error('word/document.xml または word/styles.xml が見つかりません。');
    }

    // 3. 両方のXMLを並行して読み込む
    updateProgress('XML定義ファイルを読み込み中...');
    const [docContent, styleContent] = await Promise.all([
        docFile.async('string'),
        styleFile.async('string')
    ]);
    
    // 4. XMLをパースする
    updateProgress('スタイル定義を解析中...');
    const parser = new DOMParser();
    const styleXml = parser.parseFromString(styleContent, 'application/xml');
    const stylesMap = parseStyles(styleXml); // (関数は後述)
    
    updateProgress('本文書を解析中...');
    const docXml = parser.parseFromString(docContent, 'application/xml');
    const paragraphs = parseDocument(docXml); // (関数は後述)

    // --- ここからチェック処理 ---
    updateProgress('ルールと照合し、チェックを実行中...');
    
    // --- チェック1: スタイル定義自体のチェック ---
    results.push(...checkStyleDefinitions(stylesMap));

    // --- チェック2: 実際の本
    results.push(checkPageCount(docXml));
    results.push(checkRequiredStyles(paragraphs));
    results.push(checkTextLength(paragraphs));
    results.push(checkProhibitedItems(docXml, zip));
    results.push(checkHalfWidthChars(paragraphs));
    results.push(checkKeywords(paragraphs));
    results.push(checkIndentation(paragraphs));
    results.push(checkInTextCitations(paragraphs));
    
    // 7. チェック結果の配列を返す
    return results;
}

/**
 * c. チェック結果を画面に表示する
 */
function displayResults(results) {
    resultsDiv.innerHTML = ''; // 既存の結果をクリア
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p>チェックが完了しましたが、結果がありません。</p>';
        return;
    }
    results.forEach(result => {
        const p = document.createElement('p');
        p.textContent = result.message;
        p.className = result.pass ? 'pass' : (result.warn ? 'warn' : 'fail');
        resultsDiv.appendChild(p);
    });
}


// --- ここから下はv3と同じ (解析関数とチェック関数群) ---
// (v3のscript.jsからコピー＆ペーストしてください)

/**
 * a. styles.xml を解析して、スタイル定義のマップを作成する
 */
function parseStyles(styleXml) {
    const stylesMap = new Map();
    const styleNodes = styleXml.getElementsByTagName('w:style');
    
    for (const node of styleNodes) {
        if (node.getAttribute('w:type') !== 'paragraph') continue;
        
        const styleId = node.getAttribute('w:styleId');
        if (!styleId) continue;
        
        const props = {};
        
        // 太字
        const boldNode = node.querySelector('rPr > b');
        if (boldNode) props.bold = true;
        
        // サイズ (1/2 pt)
        const sizeNode = node.querySelector('rPr > sz');
        if (sizeNode) props.size = parseInt(sizeNode.getAttribute('w:val'), 10);
        
        // 配置
        const alignNode = node.querySelector('pPr > jc');
        if (alignNode) props.align = alignNode.getAttribute('w:val');
        
        // 行間 (1/20 pt)
        const lineNode = node.querySelector('pPr > spacing');
        if (lineNode) props.line = parseInt(lineNode.getAttribute('w:line'), 10);
        
        stylesMap.set(styleId, props);
    }
    return stylesMap;
}

/**
 * b. document.xml を解析して、段落とスタイルのリストを作成する
 */
function parseDocument(docXml) {
    const paragraphs = Array.from(docXml.getElementsByTagName('w:p'));
    
    return paragraphs.map(p => {
        const styleNode = p.querySelector('pPr > pStyle');
        const styleName = styleNode ? styleNode.getAttribute('w:val') : null;
        
        const textNodes = Array.from(p.getElementsByTagName('w:t'));
        const text = textNodes.map(t => t.textContent).join('');
        
        return { style: styleName, text: text, node: p };
    });
}

/**
 * [新規] スタイル定義 (styles.xml) が執筆要領と一致しているか
 */
function checkStyleDefinitions(stylesMap) {
    const rules = [
        { id: 'summery_title',     name: '演題名',     props: { bold: true, size: 24, align: 'center' } }, // 12pt
        { id: 'summery_subtitle',  name: '副題',       props: { bold: true, size: 22, align: 'center' } }, // 11pt
        { id: 'summery_name',      name: '氏名(所属)', props: { bold: true, size: 22, align: 'center' } }, // 11pt
        { id: 'summery_body',      name: '本文',       props: { size: 18, align: 'both', line: 260 } },   // 9pt, 13pt行間
        { id: 'summery_reference', name: '参照文献',   props: { size: 18, align: 'both', line: 260 } },   // 9pt, 13pt行間
        { id: 'summery_keywords',  name: 'キーワード', props: { bold: true, size: 22, align: 'left' } },   // 11pt
    ];
    
    const results = [];
    
    for (const rule of rules) {
        const style = stylesMap.get(rule.id);
        if (!style) {
            results.push({ pass: false, message: `✗ スタイル定義: テンプレートの必須スタイル「${rule.id} (${rule.name})」がstyles.xml内に見つかりません。` });
            continue;
        }
        
        let errors = [];
        // (フォントチェックは複雑なため、ここではv3同様に太字・サイズ・配置・行間のみ)
        if (rule.props.bold && !style.bold) errors.push('太字ではありません');
        if (rule.props.size && style.size !== rule.props.size) errors.push(`文字サイズが${rule.props.size/2}ptではありません`);
        if (rule.props.align && style.align !== rule.props.align) errors.push('配置が指定と異なります');
        if (rule.props.line && style.line !== rule.props.line) errors.push('行間が13ptではありません');
        
        if (errors.length > 0) {
            results.push({ pass: false, message: `✗ スタイル定義: 「${rule.name}」スタイルの定義が変更されています (${errors.join(', ')})` });
        } else {
            results.push({ pass: true, message: `✓ スタイル定義: 「${rule.name}」スタイルの定義は正常です。` });
        }
    }
    return results;
}

/**
 * [ルール] A4縦長1枚か (簡易チェック)
 */
function checkPageCount(docXml) {
    const hasPageBreak = docXml.querySelector('br[w:type="page"]') || docXml.querySelector('sectPr');
    if (hasPageBreak) {
        return { pass: false, message: '✗ ページ数: 改ページコードまたはセクション区切りが検出されました。A4・1枚に収まらない可能性があります。' };
    }
    return { pass: true, message: '✓ ページ数: 明示的な改ページはありません。 (※最終的にはWordで開いて1枚に収まっているか目視確認してください)' };
}

/**
 * [ルール] 必須スタイルが本文中で使われているか
 */
function checkRequiredStyles(paragraphs) {
    const styles = paragraphs.map(p => p.style).filter(Boolean); // nullを除去
    const hasTitle = styles.includes('summery_title');
    const hasName = styles.includes('summery_name');
    const hasBody = styles.includes('summery_body');
    const hasKeywords = styles.includes('summery_keywords');

    if (hasTitle && hasName && hasBody && hasKeywords) {
        return { pass: true, message: '✓ スタイル使用: 演題名・氏名・本文・キーワードのスタイルが本文中で使用されています。' };
    }
    let missing = [];
    if (!hasTitle) missing.push('summery_title (演題名)');
    if (!hasName) missing.push('summery_name (氏名)');
    if (!hasBody) missing.push('summery_body (本文)');
    if (!hasKeywords) missing.push('summery_keywords (キーワード)');
    
    return { pass: false, message: `✗ スタイル使用: 以下の必須スタイルが本文中で使用されていません: ${missing.join(', ')}。` };
}

/**
 * [ルール] 本文の最低字数
 */
function checkTextLength(paragraphs) {
    const bodyText = paragraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');

    const charCount = bodyText.replace(/\s/g, '').length;
    const alphaRatio = (bodyText.match(/[a-zA-Z]/g) || []).length / (bodyText.length || 1);

    if (alphaRatio > 0.5) { // 英語
        const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount >= 500) {
            return { pass: true, message: `✓ 最低ワード数 (英語): 500ワード以上（本文 ${wordCount}ワード）` };
        }
        return { pass: false, message: `✗ 最低ワード数 (英語): 500ワード以上必要ですが、本文は ${wordCount}ワードです。` };
    } else { // 日本語
        if (charCount >= 1500) {
            return { pass: true, message: `✓ 最低文字数 (日本語): 1500字以上（本文 ${charCount}字）` };
        }
        return { pass: false, message: `✗ 最低文字数 (日本語): 1500字以上必要ですが、本文は ${charCount}字です。` };
    }
}

/**
 * [ルール] 禁止項目 (注、図版)
 */
function checkProhibitedItems(docXml, zip) {
    const text = docXml.documentElement.textContent;
    const hasNote = text.includes('注');
    const hasDrawing = docXml.getElementsByTagName('w:drawing').length > 0;
    const mediaFiles = zip.folder('word/media');

    let errors = [];
    if (hasNote) {
        errors.push('「注」の文字');
    }
    if (hasDrawing || (mediaFiles && Object.keys(mediaFiles.files).length > 0)) {
        errors.push('図版 (写真・図・表)');
    }
    
    if (errors.length > 0) {
        return { pass: false, message: `✗ 禁止項目: ${errors.join('、')} が検出されました。これらは要旨に含められません。` };
    }
    return { pass: true, message: '✓ 禁止項目: 「注」や図版は検出されませんでした。' };
}

/**
 * [ルール] アルファベットと数字は、すべて半角か
 */
function checkHalfWidthChars(paragraphs) {
    const fullText = paragraphs.map(p => p.text).join('');
    const fullWidthChars = fullText.match(/[０-９Ａ-Ｚａ-ｚ]/g);
    
    if (fullWidthChars) {
        return { pass: false, message: `✗ 文字幅: 全角の英数字が検出されました (例: ${fullWidthChars[0]})。すべて半角にしてください。` };
    }
    return { pass: true, message: '✓ 文字幅: 全角の英数字は検出されませんでした。' };
}

/**
 * [ルール] キーワードの書式
 */
function checkKeywords(paragraphs) {
    const keywordPara = paragraphs.find(p => p.style === 'summery_keywords');
    if (!keywordPara) {
        return { pass: true, message: '✓ キーワード書式: (スタイル未適用のためスキップ)' };
    }
    
    const text = keywordPara.text.trim();
    if (text.startsWith('キーワード:')) {
        const count = text.replace('キーワード:', '').split('、').filter(Boolean).length;
        if (count >= 3 && count <= 5) {
            return { pass: true, message: `✓ キーワード書式 (日本語): 書式OK（${count}語）` };
        }
        return { pass: false, message: `✗ キーワード書式 (日本語): 3～5語必要ですが、${count}語検出されました。` };

    } else if (text.startsWith('Keywords:')) {
        const count = text.replace('Keywords:', '').split(',').filter(Boolean).length;
        if (count >= 3 && count <= 5) {
            return { pass: true, message: `✓ キーワード書式 (英語): 書式OK（${count}語）` };
        }
        return { pass: false, message: `✗ キーワード書式 (英語): 3～5語必要ですが、${count}語検出されました。` };

    } else {
        return { pass: false, message: '✗ キーワード書式: 「キーワード:」または「キーワード:」で始まっていません。' };
    }
}

/**
 * [ルール] 本文の段落字下げ
 */
function checkIndentation(paragraphs) {
    const bodyParas = paragraphs.filter(p => p.style === 'summery_body' && p.text.length > 0);
    const notIndented = bodyParas.filter(p => !p.text.startsWith('　')); // 全角スペース

    if (bodyParas.length > 0 && notIndented.length > 0) {
        return { pass: false, message: `✗ 字下げ: 本文 ${bodyParas.length}段落中、${notIndented.length}段落が全角スペースで始まっていません。` };
    }
    if (bodyParas.length === 0) {
        return { pass: true, message: '✓ 字下げ: (本文テキストが空のためスキップ)' };
    }
    return { pass: true, message: '✓ 字下げ: 本文の全段落が全角スペースで始まっているようです。' };
}

/**
 * [ルール] 参照文献の挙示方法
 */
function checkInTextCitations(paragraphs) {
    const bodyText = paragraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    const citationRegex = /\[[^\]]+ \d{4}: [^\]]+\]/g; 
    const fullBracketRegex = /\[.*?\]/g;
    
    const hasCitations = citationRegex.test(bodyText);
    const hasBrackets = fullBracketRegex.test(bodyText);
    const hasRefList = paragraphs.some(p => p.style === 'summery_reference' && p.text.length > 0);

    if (hasRefList && !hasBrackets) {
        return { warn: true, message: '⚠ 参照文献: 参照文献リストがありますが、本文中に [ ] 形式の引用が見つかりません。' };
    }
    if (hasBrackets && !hasCitations) {
        return { warn: true, message: '⚠ 参照文献: 本文中に [ ] 形式の引用がありますが、書式 [著者姓 年: ページ] と一致しない可能性があります。' };
    }
    if (hasCitations) {
         return { pass: true, message: '✓ 参照文献: 本文中に指定の書式 [著者姓 年: ページ] と思われる引用が見つかりました。' };
    }
    if (!hasRefList && !hasBrackets) {
        return { pass: true, message: '✓ 参照文献: (参照文献リスト・本文中引用のいずれも見当たりませんでした)' };
    }
    return { pass: true, message: '✓ 参照文献: (本文中の引用は見当たりませんでした)' };
}
