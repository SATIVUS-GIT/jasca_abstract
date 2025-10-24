// --- DOM要素の取得 ---
const docxUpload = document.getElementById('docx-upload');
const startCheckBtn = document.getElementById('start-check-btn');
const resultsDiv = document.getElementById('results');

let selectedFile = null; 

// --- イベントリスナーの設定 ---

// 1. ファイルが選択された時の処理
docxUpload.addEventListener('change', (event) => {
    selectedFile = event.target.files[0];
    if (selectedFile) {
        startCheckBtn.disabled = false;
        resultsDiv.innerHTML = '<p>ファイルが選択されました。チェックを開始してください。</p>';
    } else {
        startCheckBtn.disabled = true;
        resultsDiv.innerHTML = '<p>ファイルを選択してください...</p>';
    }
});

// 2. チェック開始ボタンが押された時の処理
startCheckBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    startCheckBtn.disabled = true;
    
    try {
        // v8: checkDocxからextractDocxDataに変更
        // この関数は判定結果ではなく「抽出データ」を返す
        updateProgress('ファイル (.docx) を読み込んでいます...');
        const extractedData = await extractDocxData(selectedFile);
        
        // v8: 判定と表示は displayResults が行う
        updateProgress('抽出データをルールと比較し、ダッシュボードを作成中...');
        displayResults(extractedData);

    } catch (error) {
        console.error('DOCXの解析に失敗しました:', error);
        resultsDiv.innerHTML = `<p class="fail">✗ 解析エラー: ${error.message} ファイルが破損しているか、標準的でない.docxファイルの可能性があります。</p>`;
    } finally {
        startCheckBtn.disabled = false;
    }
});

/**
 * 進捗状況をUIに表示するヘルパー関数
 */
function updateProgress(message) {
    // v8: 進捗表示は <p> タグで行う
    resultsDiv.innerHTML = `<p class="progress">${message}</p>`;
}

/**
 * .docxを解析し、抽出したデータをオブジェクトとして返すメイン関数 (v8)
 * @param {File} file - アップロードされた.docxファイル
 * @returns {Promise<Object>} 抽出データ
 */
async function extractDocxData(file) {
    const extractedData = {};
    
    const arrayBuffer = await file.arrayBuffer();
    updateProgress('ファイルを解凍しています...');
    const zip = await JSZip.loadAsync(arrayBuffer); 
    
    // 2. 関連するXMLファイルを取得
    updateProgress('XML定義ファイル (本文・ヘッダー・フッター) を読み込み中...');
    const styleFile = zip.file('word/styles.xml');
    const docFile = zip.file('word/document.xml');
    const headerFiles = zip.file(/word\/header.*\.xml/);
    const footerFiles = zip.file(/word\/footer.*\.xml/);

    if (!docFile || !styleFile) {
        throw new Error('word/document.xml または word/styles.xml が見つかりません。');
    }

    // 3. 全XMLのコンテンツを並行して読み込む
    const [
        styleContent,
        docContent,
        headerContents,
        footerContents
    ] = await Promise.all([
        styleFile.async('string'),
        docFile.async('string'),
        Promise.all(headerFiles.map(f => f.async('string'))),
        Promise.all(footerFiles.map(f => f.async('string')))
    ]);
    
    // 4. XMLをパースする
    updateProgress('スタイル定義を解析中...');
    const parser = new DOMParser();
    const styleXml = parser.parseFromString(styleContent, 'application/xml');
    extractedData.styles = extractStyles(styleXml); // (関数は後述)
    
    updateProgress('本文書・ヘッダー・フッターを解析中...');
    const docXml = parser.parseFromString(docContent, 'application/xml');
    const headerXmls = headerContents.map(c => parser.parseFromString(c, 'application/xml'));
    const footerXmls = footerContents.map(c => parser.parseFromString(c, 'application/xml'));

    // 5. 段落リストを作成
    const bodyParagraphs = parseDocument(docXml); 
    const headerParagraphs = headerXmls.flatMap(xml => parseDocument(xml));
    const footerParagraphs = footerXmls.flatMap(xml => parseDocument(xml));
    const allParagraphs = [...headerParagraphs, ...bodyParagraphs, ...footerParagraphs];

    // --- ここからデータ抽出 (v8変更) ---
    // 判定(check)ではなく、抽出(extract)したファクトを格納
    
    extractedData.placeholders = extractPlaceholders(allParagraphs);
    extractedData.layout = extractLayout(docXml);
    extractedData.styleUsage = extractStyleUsage(headerParagraphs, bodyParagraphs, footerParagraphs);
    extractedData.textLength = extractTextLength(bodyParagraphs);
    extractedData.prohibited = extractProhibitedItems(docXml, zip);
    extractedData.charWidth = extractHalfWidthChars(allParagraphs);
    extractedData.keywords = extractKeywords(footerParagraphs);
    extractedData.indentation = extractIndentation(bodyParagraphs);
    extractedData.citations = extractInTextCitations(bodyParagraphs);
    extractedData.pageBreaks = extractPageBreaks(docXml); 
    
    return extractedData;
}

// --- ここから下はv8の新しい表示/抽出関数群 ---

/**
 * v8: 規定ルール
 * 執筆要領に基づき、比較対象となるルールを定義
 */
const RULES = {
    // スタイル定義
    summery_title:     { bold: true, size: 24, align: 'center', name: '演題名' },
    summery_subtitle:  { bold: true, size: 22, align: 'center', name: '副題 (オプション)' },
    summery_name:      { bold: true, size: 22, align: 'center', name: '氏名(所属)' },
    summery_body:      { size: 18, align: 'both', line: 260, name: '本文' },
    summery_reference: { size: 18, align: 'both', line: 260, name: '参照文献 (オプション)' },
    summery_keywords:  { bold: true, size: 22, align: 'left', name: 'キーワード' },
    // レイアウト
    layout: { columns: 2, name: '本文2段組' },
    // 内容
    textLength: { min: 1500, name: '本文文字数 (日本語)' },
    textLengthEn: { min: 500, name: '本文文字数 (英語)' },
    keywords: { min: 3, max: 5, name: 'キーワード数' },
};

/**
 * v8: 抽出データとルールを比較し、HTMLテーブルを生成する
 */
function displayResults(data) {
    let html = `
        <table id="check-table">
            <thead>
                <tr>
                    <th>チェック項目</th>
                    <th>抽出された情報</th>
                    <th>規定のルール</th>
                    <th>判定</th>
                </tr>
            </thead>
            <tbody>
    `;

    // --- 1. スタイル定義 ---
    html += '<tr class="category-row"><td colspan="4">スタイル定義 (styles.xml)</td></tr>';
    for (const ruleId in RULES) {
        if (!ruleId.startsWith('summery_')) continue;
        
        const rule = RULES[ruleId];
        const extracted = data.styles.get(ruleId);
        let extractedStr = '';
        let result = { class: 'pass', icon: '✓' };

        if (!extracted) {
            extractedStr = 'スタイル定義が見つかりません';
            // オプションのスタイルは 'warn'
            if (ruleId.includes('subtitle') || ruleId.includes('reference')) {
                result = { class: 'warn', icon: '△' };
            } else {
                result = { class: 'fail', icon: '✗' };
            }
        } else {
            const errors = [];
            if (rule.bold && !extracted.bold) errors.push('太字でない');
            if (rule.size && rule.size !== extracted.size) errors.push(`サイズ ${extracted.size/2}pt`);
            if (rule.align && rule.align !== extracted.align) errors.push(`配置 ${extracted.align}`);
            if (rule.line && rule.line !== extracted.line) errors.push('行間が13ptでない');
            
            if (errors.length > 0) {
                extractedStr = errors.join(', ');
                result = { class: 'fail', icon: '✗' };
            } else {
                extractedStr = `${rule.size/2}pt, ${rule.bold ? '太字, ' : ''}${rule.align}`;
            }
        }
        
        const ruleStr = `${rule.size/2}pt, ${rule.bold ? '太字, ' : ''}${rule.align}${rule.line ? ', 行間13pt' : ''}`;
        html += `<tr>
            <td><strong>${rule.name}</strong> (${ruleId})</td>
            <td class="${result.class}">${extractedStr}</td>
            <td>${ruleStr}</td>
            <td class="${result.class}">${result.icon}</td>
        </tr>`;
    }

    // --- 2. スタイル使用場所 ---
    html += '<tr class="category-row"><td colspan="4">スタイル使用場所</td></tr>';
    const usage = data.styleUsage;
    const usageRules = [
        { id: 'summery_title', name: '演題名', location: usage.header, rule: 'ヘッダー' },
        { id: 'summery_name', name: '氏名(所属)', location: usage.header, rule: 'ヘッダー' },
        { id: 'summery_body', name: '本文', location: usage.body, rule: '本文' },
        { id: 'summery_keywords', name: 'キーワード', location: usage.footer, rule: 'フッター' },
    ];
    for (const item of usageRules) {
        const found = item.location.includes(item.id);
        const result = found ? { class: 'pass', icon: '✓' } : { class: 'fail', icon: '✗' };
        html += `<tr>
            <td><strong>${item.name}</strong> (${item.id})</td>
            <td class="${result.class}">${found ? '使用されています' : '見つかりません'}</td>
            <td>${item.rule}で使用</td>
            <td class="${result.class}">${result.icon}</td>
        </tr>`;
    }

    // --- 3. レイアウト・内容 ---
    html += '<tr class="category-row"><td colspan="4">レイアウト・内容</td></tr>';

    // 2段組
    const layout = data.layout;
    const layoutResult = (layout.columns === 2) ? { class: 'pass', icon: '✓' } : { class: 'fail', icon: '✗' };
    html += `<tr>
        <td><strong>本文レイアウト</strong></td>
        <td class="${layoutResult.class}">${layout.columns}段組</td>
        <td>${RULES.layout.columns}段組</td>
        <td class="${layoutResult.class}">${layoutResult.icon}</td>
    </tr>`;
    
    // 本文文字数
    const len = data.textLength;
    const isEnglish = len.type === 'en';
    const lenRule = isEnglish ? RULES.textLengthEn : RULES.textLength;
    const lenResult = (len.count >= lenRule.min) ? { class: 'pass', icon: '✓' } : { class: 'fail', icon: '✗' };
    html += `<tr>
        <td><strong>${lenRule.name}</strong></td>
        <td class="${lenResult.class}">${len.count}${isEnglish ? 'ワード' : '字'}</td>
        <td>${lenRule.min}${isEnglish ? 'ワード' : '字'}以上</td>
        <td class="${lenResult.class}">${lenResult.icon}</td>
    </tr>`;

    // キーワード数
    const kw = data.keywords;
    const kwRule = RULES.keywords;
    let kwResult = { class: 'pass', icon: '✓' };
    let kwStr = `${kw.count}語`;
    if (!kw.startsWith) {
        kwStr = '「キーワード：」または「Keywords:」で始まっていません';
        kwResult = { class: 'fail', icon: '✗' };
    } else if (kw.count < kwRule.min || kw.count > kwRule.max) {
        kwResult = { class: 'fail', icon: '✗' };
    }
    html += `<tr>
        <td><strong>${kwRule.name}</strong></td>
        <td class="${kwResult.class}">${kwStr}</td>
        <td>${kwRule.min}～${kwRule.max}語</td>
        <td class="${kwResult.class}">${kwResult.icon}</td>
    </tr>`;

    // プレースホルダ
    const ph = data.placeholders;
    const phResult = (ph.length === 0) ? { class: 'pass', icon: '✓' } : { class: 'fail', icon: '✗' };
    html += `<tr>
        <td><strong>テンプレート指示文</strong></td>
        <td class="${phResult.class}">${ph.length > 0 ? `${ph.length}件検出: ${ph.join(', ')}` : '検出されず'}</td>
        <td>(残っていてはならない)</td>
        <td class="${phResult.class}">${phResult.icon}</td>
    </tr>`;

    // 禁止項目
    const pro = data.prohibited;
    const proResult = (pro.length === 0) ? { class: 'pass', icon: '✓' } : { class: 'fail', icon: '✗' };
    html += `<tr>
        <td><strong>禁止項目</strong></td>
        <td class="${proResult.class}">${pro.length > 0 ? `${pro.join(', ')} を検出` : '検出されず'}</td>
        <td>「注」「図版」は不可</td>
        <td class="${proResult.class}">${proResult.icon}</td>
    </tr>`;

    // 字下げ
    const indent = data.indentation;
    let indentResult = { class: 'pass', icon: '✓' };
    let indentStr = '全段落OK';
    if (indent.total > 0 && indent.missing > 0) {
        indentStr = `${indent.total}段落中、${indent.missing}段落で字下げなし`;
        indentResult = { class: 'warn', icon: '⚠' };
    } else if (indent.total === 0) {
        indentStr = '本文テキストなし';
        indentResult = { class: 'warn', icon: '⚠' };
    }
    html += `<tr>
        <td><strong>本文の字下げ</strong></td>
        <td class="${indentResult.class}">${indentStr}</td>
        <td>全段落で全角スペース</td>
        <td class="${indentResult.class}">${indentResult.icon}</td>
    </tr>`;

    // 全角英数
    const width = data.charWidth;
    const widthResult = (width.length === 0) ? { class: 'pass', icon: '✓' } : { class: 'warn', icon: '⚠' };
    html += `<tr>
        <td><strong>全角英数</strong></td>
        <td class="${widthResult.class}">${width.length > 0 ? `${width.length}件検出 (例: ${width[0]})` : '検出されず'}</td>
        <td>すべて半角</td>
        <td class="${widthResult.class}">${widthResult.icon}</td>
    </tr>`;
    
    // 参照文献
    const cit = data.citations;
    let citResult = { class: 'pass', icon: '✓' };
    let citStr = '検出されず';
    if (cit.hasRefList && !cit.hasBrackets) {
        citStr = '参照文献リストあり / 本文引用 [ ] なし';
        citResult = { class: 'warn', icon: '⚠' };
    } else if (cit.hasBrackets && !cit.hasGoodFormat) {
        citStr = '本文引用 [ ] あり / 書式が [姓 年: 頁] と不一致の可能性';
        citResult = { class: 'warn', icon: '⚠' };
    } else if (cit.hasGoodFormat) {
        citStr = '本文引用 [姓 年: 頁] を検出';
    }
    html += `<tr>
        <td><strong>参照文献と引用</strong></td>
        <td class="${citResult.class}">${citStr}</td>
        <td>本文とリストの対応</td>
        <td class="${citResult.class}">${citResult.icon}</td>
    </tr>`;

    // 改ページ
    const pb = data.pageBreaks;
    const pbResult = (pb.length === 0) ? { class: 'pass', icon: '✓' } : { class: 'warn', icon: '⚠' };
    html += `<tr>
        <td><strong>改ページコード</strong></td>
        <td class="${pbResult.class}">${pb.length > 0 ? `${pb.join(', ')} を検出` : '検出されず'}</td>
        <td>(含まないのが望ましい)</td>
        <td class="${pbResult.class}">${pbResult.icon}</td>
    </tr>`;


    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
}


// --- ここから下はv8のデータ抽出関数群 (v7のcheck関数を改変) ---

/**
 * v8: styles.xml を解析して、スタイル定義のマップを作成する (v7 parseStylesと同じ)
 */
function extractStyles(styleXml) {
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
 * v8: document.xml (または header/footer.xml) を解析する (v7 parseDocumentと同じ)
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
 * v8: プレースホルダ（テンプレートの指示文）が残っていないか
 */
function extractPlaceholders(allParagraphs) {
    const found = [];
    const fullText = allParagraphs.map(p => p.text).join('');

    if (fullText.includes('※ ここに「演題名」を書いてください')) found.push('「演題名」指示文');
    if (fullText.includes('（←消去してご使用ください）')) found.push('「消去して...」指示文');
    if (fullText.includes('□□□□')) found.push('□□□□');
    if (fullText.includes('発表者氏名（所属）')) found.push('「発表者氏名...」');
    
    return found;
}

/**
 * v8: 本文が2段組かチェック
 */
function extractLayout(docXml) {
    const cols = docXml.querySelector('w\\:body > w\\:sectPr w\\:cols');
    if (cols) {
        return { columns: parseInt(cols.getAttribute('w:num'), 10) || 1 };
    }
    return { columns: 1 };
}

/**
 * v8: 必須スタイルが使われている場所
 */
function extractStyleUsage(headerParagraphs, bodyParagraphs, footerParagraphs) {
    return {
        header: [...new Set(headerParagraphs.map(p => p.style).filter(Boolean))],
        body:   [...new Set(bodyParagraphs.map(p => p.style).filter(Boolean))],
        footer: [...new Set(footerParagraphs.map(p => p.style).filter(Boolean))]
    };
}

/**
 * v8: 本文の最低字数
 */
function extractTextLength(bodyParagraphs) {
    const bodyText = bodyParagraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    if (bodyText.length === 0) {
         return { count: 0, type: 'jp' };
    }

    const charCount = bodyText.replace(/\s/g, '').length;
    const alphaRatio = (bodyText.match(/[a-zA-Z]/g) || []).length / (bodyText.length || 1);

    if (alphaRatio > 0.5) { // 英語
        const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
        return { count: wordCount, type: 'en' };
    } else { // 日本語
        return { count: charCount, type: 'jp' };
    }
}

/**
 * v8: 禁止項目 (注、図版)
 */
function extractProhibitedItems(docXml, zip) {
    const text = docXml.documentElement.textContent;
    const hasNote = text.includes('注');
    const hasDrawing = docXml.getElementsByTagName('w:drawing').length > 0 || docXml.getElementsByTagName('w:pict').length > 0;
    const mediaFiles = zip.folder('word/media');

    let errors = [];
    if (hasNote) errors.push('「注」');
    if (hasDrawing || (mediaFiles && Object.keys(mediaFiles.files).length > 0)) {
        errors.push('図版 (写真・図・表)');
    }
    return errors;
}

/**
 * v8: アルファベットと数字は、すべて半角か
 */
function extractHalfWidthChars(allParagraphs) {
    const fullText = allParagraphs.map(p => p.text).join('');
    const fullWidthChars = fullText.match(/[０-９Ａ-Ｚａ-ｚ]/g);
    
    if (fullWidthChars) {
        // 重複を除外して返す
        return [...new Set(fullWidthChars)];
    }
    return [];
}

/**
 * v8: キーワードの書式
 */
function extractKeywords(footerParagraphs) {
    const keywordPara = footerParagraphs.find(p => p.style === 'summery_keywords');
    if (!keywordPara) {
        return { count: 0, startsWith: false, text: 'スタイル未適用' };
    }
    
    const text = keywordPara.text.trim();
    if (text.startsWith('キーワード：')) {
        const count = text.replace('キーワード：', '').split('、').filter(s => s.trim().length > 0).length;
        return { count: count, startsWith: true, text: text };
    } else if (text.startsWith('Keywords:')) {
        const count = text.replace('Keywords:', '').split(',').filter(s => s.trim().length > 0).length;
        return { count: count, startsWith: true, text: text };
    } else {
        return { count: 0, startsWith: false, text: text };
    }
}

/**
 * v8: 本文の段落字下げ
 */
function extractIndentation(bodyParagraphs) {
    const bodyParas = bodyParagraphs.filter(p => p.style === 'summery_body' && p.text.length > 0);
    const notIndented = bodyParas.filter(p => !p.text.startsWith('　')); // 全角スペース

    return { total: bodyParas.length, missing: notIndented.length };
}

/**
 * v8: 参照文献の挙示方法
 */
function extractInTextCitations(bodyParagraphs) {
    const bodyText = bodyParagraphs
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    const citationRegex = /\[[^\]]+ \d{4}: [^\]]+\]/g; 
    const fullBracketRegex = /\[.*?\]/g;
    
    const hasRefList = bodyParagraphs.some(p => p.style === 'summery_reference' && p.text.length > 0) || 
                       bodyParagraphs.some(p => p.text.includes('参照文献'));

    return {
        hasRefList: hasRefList,
        hasBrackets: fullBracketRegex.test(bodyText),
        hasGoodFormat: citationRegex.test(bodyText)
    };
}

/**
 * v8: 改ページコード
 */
function extractPageBreaks(docXml) {
    const found = [];
    const pageBreak = docXml.querySelector('w\\:br[w\\:type="page"]'); 
    const sectionBreak = docXml.querySelector('w\\:sectPr'); 
    
    if (pageBreak) {
        found.push('改ページコード');
    }
    if (sectionBreak && !docXml.querySelector('w\\:sectPr w\\:cols')) {
         // 2段組以外のセクション区切りは改ページとみなす
         found.push('セクション区切り');
    }
    return found;
}
