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
 * .docxを解析し、チェック結果の配列を返すメイン関数 (v7)
 * @param {File} file - アップロードされた.docxファイル
 * @returns {Promise<Array>} チェック結果の配列
 */
async function checkDocx(file) {
    updateProgress('ファイル (.docx) を読み込んでいます...');
    
    let results = []; // チェック結果
    
    // 1. .docx (zip) を読み込む
    const arrayBuffer = await file.arrayBuffer();
    updateProgress('ファイルを解凍しています...');
    const zip = await JSZip.loadAsync(arrayBuffer); // J (大文字)
    
    // 2. 関連するXMLファイルを取得 (v7変更)
    updateProgress('XML定義ファイル (本文・ヘッダー・フッター) を読み込み中...');
    const styleFile = zip.file('word/styles.xml');
    const docFile = zip.file('word/document.xml');
    // ヘッダー/フッターは複数存在する可能性があるため、正規表現で全て取得
    const headerFiles = zip.file(/word\/header.*\.xml/);
    const footerFiles = zip.file(/word\/footer.*\.xml/);

    if (!docFile || !styleFile) {
        throw new Error('word/document.xml または word/styles.xml が見つかりません。');
    }

    // 3. 全XMLのコンテンツを並行して読み込む (v7変更)
    const [
        styleContent,
        docContent,
        headerContents,
        footerContents
    ] = await Promise.all([
        styleFile.async('string'),
        docFile.async('string'),
        Promise.all(headerFiles.map(f => f.async('string'))), // ヘッダー全読み込み
        Promise.all(footerFiles.map(f => f.async('string')))  // フッター全読み込み
    ]);
    
    // 4. XMLをパースする (v7変更)
    updateProgress('スタイル定義を解析中...');
    const parser = new DOMParser();
    const styleXml = parser.parseFromString(styleContent, 'application/xml');
    const stylesMap = parseStyles(styleXml); // (関数は後述)
    
    updateProgress('本文書・ヘッダー・フッターを解析中...');
    const docXml = parser.parseFromString(docContent, 'application/xml');
    const headerXmls = headerContents.map(c => parser.parseFromString(c, 'application/xml'));
    const footerXmls = footerContents.map(c => parser.parseFromString(c, 'application/xml'));

    // 5. 段落リストを作成 (v7変更)
    const bodyParagraphs = parseDocument(docXml); // (関数は後述)
    // flatMapで複数のヘッダー/フッターファイルを1つのリストに統合
    const headerParagraphs = headerXmls.flatMap(xml => parseDocument(xml));
    const footerParagraphs = footerXmls.flatMap(xml => parseDocument(xml));
    const allParagraphs = [...headerParagraphs, ...bodyParagraphs, ...footerParagraphs];


    // --- ここからチェック処理 (v7変更) ---
    updateProgress('ルールと照合し、チェックを実行中...');
    
    results.push(...checkStyleDefinitions(stylesMap)); // スタイル定義
    results.push(...checkPlaceholders(allParagraphs)); // プレースホルダ
    results.push(checkLayout(docXml)); // [v7新規] 2段組チェック
    results.push(...checkRequiredStyles(headerParagraphs, bodyParagraphs, footerParagraphs)); // [v7変更] スタイル使用場所
    results.push(checkTextLength(bodyParagraphs)); // 本文文字数 (対象: body)
    results.push(checkProhibitedItems(docXml, zip)); // 禁止項目 (対象: body)
    results.push(checkHalfWidthChars(allParagraphs)); // 半角/全角 (対象: all)
    results.push(checkKeywords(footerParagraphs)); // キーワード書式 (対象: footer)
    results.push(checkIndentation(bodyParagraphs)); // 字下げ (対象: body)
    results.push(checkInTextCitations(bodyParagraphs)); // 引用 (対象: body)
    results.push(checkPageCount(docXml)); // 改ページ (対象: body)
    
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


// --- ここから下はチェック関数群 ---

/**
 * a. styles.xml を解析して、スタイル定義のマップを作成する (v5/v6と同様)
 */
function parseStyles(styleXml) {
    const stylesMap = new Map();
    const styleNodes = styleXml.getElementsByTagName('w:style');
    
    for (const node of styleNodes) {
        if (node.getAttribute('w:type') !== 'paragraph') continue;
        const styleId = node.getAttribute('w:styleId');
        if (!styleId) continue;
        const props = {};
        
        const boldNode = node.querySelector('w\\:rPr > w\\:b');
        if (boldNode) props.bold = true;
        const sizeNode = node.querySelector('w\\:rPr > w\\:sz');
        if (sizeNode) props.size = parseInt(sizeNode.getAttribute('w:val'), 10);
        const alignNode = node.querySelector('w\\:pPr > w\\:jc');
        if (alignNode) props.align = alignNode.getAttribute('w:val');
        const lineNode = node.querySelector('w\\:pPr > w\\:spacing');
        if (lineNode) props.line = parseInt(lineNode.getAttribute('w:line'), 10);
        
        stylesMap.set(styleId, props);
    }
    return stylesMap;
}

/**
 * b. document.xml (または header/footer.xml) を解析する (v5/v6と同様)
 */
function parseDocument(docXml) {
    const paragraphs = Array.from(docXml.getElementsByTagName('w:p'));
    
    return paragraphs.map(p => {
        const styleNode = p.querySelector('w\\:pPr > w\\:pStyle');
        const styleName = styleNode ? styleNode.getAttribute('w:val') : null;
        const textNodes = Array.from(p.getElementsByTagName('w:t'));
        const text = textNodes.map(t => t.textContent).join('');
        return { style: styleName, text: text, node: p };
    });
}

/**
 * [v6] プレースホルダ（テンプレートの指示文）が残っていないか
 * (v7変更: 対象を allParagraphs に)
 */
function checkPlaceholders(allParagraphs) {
    const results = [];
    const fullText = allParagraphs.map(p => p.text).join('');

    if (fullText.includes('※ ここに「演題名」を書いてください')) {
        results.push({ pass: false, message: '✗ プレースホルダ: 「※ ここに「演題名」を書いてください」の指示文が残っています。' });
    }
    if (fullText.includes('（←消去してご使用ください）')) {
        results.push({ pass: false, message: '✗ プレースホルダ: 「（←消去してご使用ください）」の指示文が残っています。' });
    }
    if (fullText.includes('□□□□')) {
        results.push({ pass: false, message: '✗ プレースホルダ: 「□□□□」のダミーテキストが残っています。本文やキーワードを記入してください。' });
    }
    if (fullText.includes('発表者氏名（所属）')) {
        results.push({ warn: true, message: '⚠ プレースホルダ: 「発表者氏名（所属）」の文字列が残っていませんか？ご自身の氏名・所属に置き換えてください。' });
    }
    
    if (results.length === 0) {
        results.push({ pass: true, message: '✓ プレースホルダ: テンプレートの指示文やダミーテキストは残っていません。' });
    }
    return results;
}


/**
 * [v5/v6] スタイル定義 (styles.xml) が執筆要領と一致しているか
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
            // 副題(subtitle)や参照文献(reference)はオプション
            if (rule.id === 'summery_subtitle' || rule.id === 'summery_reference') {
                results.push({ warn: true, message: `△ スタイル定義: オプションのスタイル「${rule.id} (${rule.name})」が見つかりません。 (使用しない場合は問題ありません)` });
            } else {
                results.push({ pass: false, message: `✗ スタイル定義: テンプレートの必須スタイル「${rule.id} (${rule.name})」がstyles.xml内に見つかりません。` });
            }
            continue;
        }
        
        let errors = [];
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
 * [v7 新規] 本文が2段組かチェック
 */
function checkLayout(docXml) {
    // 文書本体のセクション設定 (<w:body> の直下または末尾の <w:sectPr>) にある段組設定 (<w:cols>) を探す
    const cols = docXml.querySelector('w\\:body > w\\:sectPr w\\:cols');
    if (cols && cols.getAttribute('w:num') === '2') {
        return { pass: true, message: '✓ レイアウト: 本文が2段組に設定されています。' };
    }
    return { pass: false, message: '✗ レイアウト: 本文が2段組に設定されていません。' };
}


/**
 * [v7 変更] 必須スタイルが正しい場所 (H/F/B) で使われているか
 */
function checkRequiredStyles(headerParagraphs, bodyParagraphs, footerParagraphs) {
    const headerStyles = headerParagraphs.map(p => p.style).filter(Boolean);
    const bodyStyles = bodyParagraphs.map(p => p.style).filter(Boolean);
    const footerStyles = footerParagraphs.map(p => p.style).filter(Boolean);

    let errors = [];
    if (!headerStyles.includes('summery_title')) errors.push('演題名 (summery_title) がヘッダーにありません');
    if (!headerStyles.includes('summery_name')) errors.push('氏名 (summery_name) がヘッダーにありません');
    if (!bodyStyles.includes('summery_body')) errors.push('本文 (summery_body) が文書本体にありません');
    if (!footerStyles.includes('summery_keywords')) errors.push('キーワード (summery_keywords) がフッターにありません');

    if (errors.length > 0) {
        return [{ pass: false, message: `✗ スタイル使用: 必須スタイルが正しい場所で使用されていません: ${errors.join(', ')}。` }];
    }
    return [{ pass: true, message: '✓ スタイル使用: 必須スタイルがヘッダー・本文・フッターの正しい位置で使用されています。' }];
}


/**
 * [v5/v6] 本文の最低字数
 * (v7変更: 対象を bodyParagraphs に)
 */
function checkTextLength(bodyParagraphs) {
    const bodyText = bodyParagraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    if (bodyText.length === 0) {
         return { pass: false, message: '✗ 最低文字数: 本文 (`summery_body` スタイル) にテキストがありません。' };
    }

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
 * [v5/v6] 禁止項目 (注、図版)
 */
function checkProhibitedItems(docXml, zip) {
    const text = docXml.documentElement.textContent;
    const hasNote = text.includes('注');
    const hasDrawing = docXml.getElementsByTagName('w:drawing').length > 0 || docXml.getElementsByTagName('w:pict').length > 0;
    const mediaFiles = zip.folder('word/media');

    let errors = [];
    if (hasNote) {
        errors.push('「注」の文字');
    }
    if (hasDrawing || (mediaFiles && Object.keys(mediaFiles.files).length > 0)) {
        errors.push('図版 (写真・図・表)');
    }
    
    if (errors.length > 0) {
        return { pass: false, message: `✗ 禁止項目: 本文に ${errors.join('、')} が検出されました。これらは要旨に含められません。` };
    }
    return { pass: true, message: '✓ 禁止項目: 「注」や図版は検出されませんでした。' };
}

/**
 * [v5/v6] アルファベットと数字は、すべて半角か
 * (v7変更: 対象を allParagraphs に)
 */
function checkHalfWidthChars(allParagraphs) {
    const fullText = allParagraphs.map(p => p.text).join('');
    const fullWidthChars = fullText.match(/[０-９Ａ-Ｚａ-ｚ]/g);
    
    if (fullWidthChars) {
        return { pass: false, message: `✗ 文字幅: 全角の英数字が検出されました (例: ${fullWidthChars[0]})。すべて半角にしてください。` };
    }
    return { pass: true, message: '✓ 文字幅: 全角の英数字は検出されませんでした。' };
}

/**
 * [v5/v6] キーワードの書式
 * (v7変更: 対象を footerParagraphs に)
 */
function checkKeywords(footerParagraphs) {
    const keywordPara = footerParagraphs.find(p => p.style === 'summery_keywords');
    if (!keywordPara) {
        // (スタイル使用チェックでエラーが出るので、ここでは重複してエラーを出さない)
        return { pass: true, message: '✓ キーワード書式: (スタイル未適用のためスキップ)' };
    }
    
    const text = keywordPara.text.trim();
    if (text.startsWith('キーワード：')) { // (コロンを全角に変更)
        const count = text.replace('キーワード：', '').split('、').filter(s => s.trim().length > 0).length;
        if (count >= 3 && count <= 5) {
            return { pass: true, message: `✓ キーワード書式 (日本語): 書式OK（${count}語）` };
        }
        return { pass: false, message: `✗ キーワード書式 (日本語): 3～5語必要ですが、${count}語検出されました。` };

    } else if (text.startsWith('Keywords:')) {
        const count = text.replace('Keywords:', '').split(',').filter(s => s.trim().length > 0).length;
        if (count >= 3 && count <= 5) {
            return { pass: true, message: `✓ キーワード書式 (英語): 書式OK（${count}語）` };
        }
        return { pass: false, message: `✗ キーワード書式 (英語): 3～5語必要ですが、${count}語検出されました。` };

    } else {
        return { pass: false, message: '✗ キーワード書式: 「キーワード：」または「Keywords:」で始まっていません。' };
    }
}

/**
 * [v5/v6] 本文の段落字下げ
 * (v7変更: 対象を bodyParagraphs に)
 */
function checkIndentation(bodyParagraphs) {
    const bodyParas = bodyParagraphs.filter(p => p.style === 'summery_body' && p.text.length > 0);
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
 * [v5/v6] 参照文献の挙示方法
 * (v7変更: 対象を bodyParagraphs に)
 */
function checkInTextCitations(bodyParagraphs) {
    const bodyText = bodyParagraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    const citationRegex = /\[[^\]]+ \d{4}: [^\]]+\]/g; 
    const fullBracketRegex = /\[.*?\]/g;
    
    const hasCitations = citationRegex.test(bodyText);
    const hasBrackets = fullBracketRegex.test(bodyText);
    // 参照文献スタイルが使われているか、または「参照文献」のテキストがあるか
    const hasRefList = bodyParagraphs.some(p => p.style === 'summery_reference' && p.text.length > 0) || 
                       bodyParagraphs.some(p => p.text.includes('参照文献'));

    if (hasRefList && !hasBrackets) {
        return { warn: true, message: '⚠ 参照文献: 参照文献リスト がありますが、本文中に [ ] 形式の引用が見つかりません。' };
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

/**
 * [v5/v6] A4縦長1枚か (簡易チェック)
 */
function checkPageCount(docXml) {
    const pageBreak = docXml.querySelector('w\\:br[w\\:type="page"]'); 
    const sectionBreak = docXml.querySelector('w\\:sectPr'); 
    
    if (pageBreak || sectionBreak) {
        // セクション区切りは2段組設定にも使われるため、「改ページを伴うタイプ」か簡易的に判定
        if (sectionBreak && !docXml.querySelector('w\\:sectPr w\\:cols')) {
             return { pass: false, message: '✗ ページ数: セクション区切りが検出されました。A4・1枚に収まらない可能性があります。' };
        }
        if (pageBreak) {
             return { pass: false, message: '✗ ページ数: 改ページコードが検出されました。A4・1枚に収まらない可能性があります。' };
        }
    }
    return { pass: true, message: '✓ ページ数: 明示的な改ページはありません。 (※最終的にはWordで開いて1枚に収まっているか目視確認してください)' };
}
