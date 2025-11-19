// --- DOM要素の取得 ---
const docxUpload = document.getElementById('docx-upload');
const startCheckBtn = document.getElementById('start-check-btn');
const resetBtn = document.getElementById('reset-btn');
const resultsDiv = document.getElementById('results');

let selectedFile = null; 

// --- イベントリスナー ---

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

startCheckBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    // UI切り替え
    startCheckBtn.disabled = true;
    docxUpload.disabled = true;
    
    try {
        updateProgress('ファイル (.docx) を読み込んでいます...');
        const extractedData = await extractDocxData(selectedFile);
        
        updateProgress('データを解析中...');
        displayResults(extractedData);
        
        // 完了後にリセットボタン表示
        resetBtn.style.display = 'inline-block';
        startCheckBtn.style.display = 'none';

    } catch (error) {
        console.error(error);
        resultsDiv.innerHTML = `<p class="fail">✗ エラーが発生しました: ${error.message}<br>ファイルが破損しているか、Word形式ではない可能性があります。</p>`;
        resetBtn.style.display = 'inline-block';
    }
});

resetBtn.addEventListener('click', () => {
    location.reload(); // シンプルにリロードしてリセット
});

function updateProgress(message) {
    resultsDiv.innerHTML = `<p class="progress">${message}</p>`;
}


// --- データ抽出ロジック (v9) ---

async function extractDocxData(file) {
    const extractedData = {};
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer); 
    
    // XMLファイル取得
    const styleFile = zip.file('word/styles.xml');
    const docFile = zip.file('word/document.xml');
    // 正規表現でヘッダー/フッターを全取得
    const headerFiles = zip.file(/word\/header.*\.xml/);
    const footerFiles = zip.file(/word\/footer.*\.xml/);

    if (!docFile || !styleFile) {
        throw new Error('必須ファイル (document.xml / styles.xml) が見つかりません。');
    }

    // 読み込み
    const [styleContent, docContent, headerContents, footerContents] = await Promise.all([
        styleFile.async('string'),
        docFile.async('string'),
        Promise.all(headerFiles.map(f => f.async('string'))),
        Promise.all(footerFiles.map(f => f.async('string')))
    ]);
    
    const parser = new DOMParser();

    // 1. スタイル解析 (フォント情報追加)
    const styleXml = parser.parseFromString(styleContent, 'application/xml');
    extractedData.styles = extractStyles(styleXml);
    
    // 2. 文書構造解析
    const docXml = parser.parseFromString(docContent, 'application/xml');
    const headerXmls = headerContents.map(c => parser.parseFromString(c, 'application/xml'));
    const footerXmls = footerContents.map(c => parser.parseFromString(c, 'application/xml'));

    const bodyParagraphs = parseDocument(docXml); 
    const headerParagraphs = headerXmls.flatMap(xml => parseDocument(xml));
    const footerParagraphs = footerXmls.flatMap(xml => parseDocument(xml));
    const allParagraphs = [...headerParagraphs, ...bodyParagraphs, ...footerParagraphs];

    // 3. データ抽出実行
    extractedData.placeholders = extractPlaceholders(allParagraphs);
    extractedData.layout = extractLayout(docXml); // ロジック強化
    extractedData.styleUsage = extractStyleUsage(headerParagraphs, bodyParagraphs, footerParagraphs);
    extractedData.textLength = extractTextLength(bodyParagraphs);
    extractedData.prohibited = extractProhibitedItems(docXml, zip);
    extractedData.charWidth = extractHalfWidthChars(allParagraphs);
    extractedData.keywords = extractKeywords(footerParagraphs); // ロジック強化
    extractedData.indentation = extractIndentation(bodyParagraphs);
    extractedData.citations = extractInTextCitations(bodyParagraphs);
    extractedData.pageBreaks = extractPageBreaks(docXml); 
    
    return extractedData;
}

// --- 規定ルール定義 ---
const RULES = {
    // フォント定義を追加
    summery_title:     { bold: true, size: 24, align: 'center', fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: '演題名' },
    summery_subtitle:  { bold: true, size: 22, align: 'center', fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: '副題' },
    summery_name:      { bold: true, size: 22, align: 'center', fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: '氏名(所属)' },
    summery_body:      { size: 18, align: 'both', line: 260, fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: '本文' },
    summery_reference: { size: 18, align: 'both', line: 260, fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: '参照文献' },
    summery_keywords:  { bold: true, size: 22, align: 'left', fontEn: 'Times New Roman', fontJp: 'MS Mincho', name: 'キーワード' },
    
    layout: { columns: 2, name: '本文2段組' },
    textLength: { min: 1500, name: '本文文字数 (日本語)' },
    textLengthEn: { min: 500, name: '本文文字数 (英語)' },
    keywords: { min: 3, max: 5, name: 'キーワード数' },
};


// --- 表示ロジック ---

function displayResults(data) {
    let html = `
        <table id="check-table">
            <thead>
                <tr>
                    <th>項目</th>
                    <th>あなたのファイルの状況</th>
                    <th>規定のルール</th>
                    <th>判定</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 1. スタイル定義 (フォントチェック追加)
    html += '<tr class="category-row"><td colspan="4">スタイル定義 (styles.xml)</td></tr>';
    for (const ruleId in RULES) {
        if (!ruleId.startsWith('summery_')) continue;
        const rule = RULES[ruleId];
        const extracted = data.styles.get(ruleId);
        
        let resultClass = 'pass';
        let resultIcon = '✓';
        let details = [];

        if (!extracted) {
            if (ruleId.includes('subtitle') || ruleId.includes('reference')) {
                resultClass = 'warn'; resultIcon = '-'; details.push('設定なし (オプション)');
            } else {
                resultClass = 'fail'; resultIcon = '✗'; details.push('<span class="diff-highlight">スタイル定義なし</span>');
            }
        } else {
            // 比較ロジック
            if (rule.bold && !extracted.bold) details.push('<span class="diff-highlight">太字なし</span>');
            if (rule.size && rule.size !== extracted.size) details.push(`<span class="diff-highlight">サイズ違い(${extracted.size/2}pt)</span>`);
            if (rule.align && rule.align !== extracted.align) details.push(`<span class="diff-highlight">配置違い(${extracted.align})</span>`);
            if (rule.line && rule.line !== extracted.line) details.push('<span class="diff-highlight">行間違い</span>');
            
            // フォントチェック (MS Mincho または MS 明朝 を許容)
            const fontJp = extracted.fontJp || '';
            const fontEn = extracted.fontEn || '';
            if (!fontJp.includes('Mincho') && !fontJp.includes('明朝')) details.push(`<span class="diff-highlight">和文フォント(${fontJp})</span>`);
            if (!fontEn.toLowerCase().includes('times')) details.push(`<span class="diff-highlight">欧文フォント(${fontEn})</span>`);

            if (details.length > 0) {
                resultClass = 'fail'; resultIcon = '✗';
            } else {
                details.push('書式OK');
            }
        }

        html += `<tr>
            <td><strong>${rule.name}</strong><br><span style="font-size:0.8em;color:#666">${ruleId}</span></td>
            <td>${details.join(', ')}</td>
            <td>${rule.size/2}pt, ${rule.bold?'太字, ':''}${rule.align}<br>MS明朝 / Times New Roman</td>
            <td class="${resultClass}">${resultIcon}</td>
        </tr>`;
    }

    // 2. スタイル使用状況
    html += '<tr class="category-row"><td colspan="4">スタイルの適用場所</td></tr>';
    const usageList = [
        { id: 'summery_title', name: '演題名', target: data.styleUsage.header, place: 'ヘッダー' },
        { id: 'summery_name', name: '氏名(所属)', target: data.styleUsage.header, place: 'ヘッダー' },
        { id: 'summery_body', name: '本文', target: data.styleUsage.body, place: '本文' },
        { id: 'summery_keywords', name: 'キーワード', target: data.styleUsage.footer, place: 'フッター' }
    ];

    usageList.forEach(item => {
        const used = item.target.includes(item.id);
        const resultClass = used ? 'pass' : 'fail';
        html += `<tr>
            <td>${item.name}</td>
            <td class="${resultClass}">${used ? '適用されています' : '<span class="diff-highlight">未適用</span>'}</td>
            <td>${item.place}</td>
            <td class="${resultClass}">${used ? '✓' : '✗'}</td>
        </tr>`;
    });

    // 3. レイアウトと内容
    html += '<tr class="category-row"><td colspan="4">レイアウト・内容</td></tr>';
    
    // レイアウト
    const is2Cols = data.layout.columns === 2;
    html += `<tr>
        <td>本文レイアウト</td>
        <td class="${is2Cols ? 'pass' : 'fail'}">${data.layout.columns}段組</td>
        <td>2段組</td>
        <td class="${is2Cols ? 'pass' : 'fail'}">${is2Cols ? '✓' : '✗'}</td>
    </tr>`;

    // 文字数
    const isEn = data.textLength.type === 'en';
    const count = data.textLength.count;
    const min = isEn ? RULES.textLengthEn.min : RULES.textLength.min;
    const lenOk = count >= min;
    html += `<tr>
        <td>文字数 (${isEn ? '英語' : '日本語'})</td>
        <td class="${lenOk ? 'pass' : 'fail'}">${count} ${isEn?'words':'文字'}</td>
        <td>${min} ${isEn?'words':'文字'}以上</td>
        <td class="${lenOk ? 'pass' : 'fail'}">${lenOk ? '✓' : '✗'}</td>
    </tr>`;

    // キーワード
    const kw = data.keywords;
    let kwMsg = `${kw.count}語`;
    let kwOk = true;
    if (!kw.foundHeader) {
        kwMsg = '<span class="diff-highlight">「キーワード：」の表記なし</span>';
        kwOk = false;
    } else if (kw.count < 3 || kw.count > 5) {
        kwMsg = `<span class="diff-highlight">${kw.count}語</span>`;
        kwOk = false;
    }
    html += `<tr>
        <td>キーワード数</td>
        <td class="${kwOk ? 'pass' : 'fail'}">${kwMsg}</td>
        <td>3〜5語</td>
        <td class="${kwOk ? 'pass' : 'fail'}">${kwOk ? '✓' : '✗'}</td>
    </tr>`;

    // プレースホルダ (残存チェック)
    const ph = data.placeholders;
    const phOk = ph.length === 0;
    html += `<tr>
        <td>テンプレート指示文</td>
        <td class="${phOk ? 'pass' : 'fail'}">${phOk ? '検出されず' : `<span class="diff-highlight">${ph.join(', ')} が残っています</span>`}</td>
        <td>削除済みであること</td>
        <td class="${phOk ? 'pass' : 'fail'}">${phOk ? '✓' : '✗'}</td>
    </tr>`;

    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
}


// --- 詳細抽出関数 (v9) ---

// 1. スタイル詳細抽出 (フォント情報追加)
function extractStyles(styleXml) {
    const map = new Map();
    const nodes = styleXml.getElementsByTagName('w:style');
    
    for (const node of nodes) {
        if (node.getAttribute('w:type') !== 'paragraph') continue;
        const id = node.getAttribute('w:styleId');
        if (!id) continue;

        const props = {};
        
        // 基本プロパティ (安全なアクセス ?. を使用)
        if (node.querySelector('w\\:rPr > w\\:b')) props.bold = true;
        
        const sz = node.querySelector('w\\:rPr > w\\:sz')?.getAttribute('w:val');
        if (sz) props.size = parseInt(sz, 10);
        
        const jc = node.querySelector('w\\:pPr > w\\:jc')?.getAttribute('w:val');
        if (jc) props.align = jc;
        
        const spacing = node.querySelector('w\\:pPr > w\\:spacing')?.getAttribute('w:line');
        if (spacing) props.line = parseInt(spacing, 10);

        // フォント情報抽出 (v9追加)
        const rFonts = node.querySelector('w\\:rPr > w\\:rFonts');
        if (rFonts) {
            props.fontEn = rFonts.getAttribute('w:ascii') || rFonts.getAttribute('w:hAnsi');
            props.fontJp = rFonts.getAttribute('w:eastAsia');
        }

        map.set(id, props);
    }
    return map;
}

// 2. 文書解析
function parseDocument(xml) {
    const paras = Array.from(xml.getElementsByTagName('w:p'));
    return paras.map(p => {
        const style = p.querySelector('w\\:pPr > w\\:pStyle')?.getAttribute('w:val');
        const texts = Array.from(p.getElementsByTagName('w:t'));
        const text = texts.map(t => t.textContent).join('');
        return { style, text, node: p };
    });
}

// 3. レイアウト解析 (v9: 全セクションをスキャン)
function extractLayout(docXml) {
    // w:sectPr は w:body の直下(最後) または 各 w:p/w:pPr の中に存在する
    const sectPrs = Array.from(docXml.getElementsByTagName('w:sectPr'));
    
    // どれか1つでも「2段組 (w:num="2")」があればOKとみなす
    // (厳密には「本文エリア」の設定を見るべきだが、要旨A4一枚ならこれで十分)
    const hasTwoCols = sectPrs.some(sect => {
        const cols = sect.getElementsByTagName('w:cols')[0];
        return cols && cols.getAttribute('w:num') === '2';
    });

    return { columns: hasTwoCols ? 2 : 1 };
}

// 4. キーワード解析 (v9: 表記ゆれ対応)
function extractKeywords(footerParas) {
    const kwPara = footerParas.find(p => p.style === 'summery_keywords');
    if (!kwPara) return { count: 0, foundHeader: false };

    const text = kwPara.text.trim();
    // 正規表現で「キーワード」の後の区切り文字（全角コロン、半角コロン、スペース等）を柔軟に判定
    // 例: "Keywords:", "キーワード：", "キーワード "
    const match = text.match(/^(?:キーワード|Keywords)[:：\s]+(.*)$/i);
    
    if (match) {
        const content = match[1]; // "A, B, C" の部分
        // 読点(、) または カンマ(,) で分割
        const words = content.split(/[、,]+/).filter(w => w.trim().length > 0);
        return { count: words.length, foundHeader: true };
    }
    
    return { count: 0, foundHeader: false };
}

// 5. プレースホルダ検出
function extractPlaceholders(paras) {
    const found = [];
    const text = paras.map(p => p.text).join('');
    
    if (text.includes('ここに「演題名」')) found.push('演題名指示文');
    if (text.includes('消去してご使用')) found.push('消去指示文');
    if (text.includes('□□□')) found.push('ダミー四角(□)');
    if (text.includes('発表者氏名（所属）')) found.push('氏名プレースホルダ');
    
    return found;
}

// 6. スタイル使用状況
function extractStyleUsage(header, body, footer) {
    const getStyles = (list) => list.map(p => p.style).filter(Boolean);
    return {
        header: getStyles(header),
        body: getStyles(body),
        footer: getStyles(footer)
    };
}

// 7. 本文文字数
function extractTextLength(paras) {
    const bodyText = paras
        .filter(p => p.style === 'summery_body')
        .map(p => p.text)
        .join('');
    
    const isEn = (bodyText.match(/[a-zA-Z]/g) || []).length > (bodyText.length / 2);
    const count = isEn 
        ? bodyText.trim().split(/\s+/).filter(Boolean).length 
        : bodyText.replace(/\s/g, '').length;

    return { count, type: isEn ? 'en' : 'jp' };
}

// 8. 禁止項目
function extractProhibitedItems(docXml, zip) {
    const text = docXml.documentElement.textContent;
    const errors = [];
    if (text.includes('注')) errors.push('「注」');
    
    const drawings = docXml.getElementsByTagName('w:drawing').length 
                   + docXml.getElementsByTagName('w:pict').length;
    
    // 画像ファイルが word/media フォルダにあるかも確認
    const media = zip.folder('word/media');
    const hasMedia = media && Object.keys(media.files).length > 0;

    if (drawings > 0 || hasMedia) errors.push('図表・画像');
    
    return errors;
}

// 9. 全角英数
function extractHalfWidthChars(paras) {
    const text = paras.map(p => p.text).join('');
    return text.match(/[０-９Ａ-Ｚａ-ｚ]/g) || [];
}

// 10. 字下げ
function extractIndentation(paras) {
    // 本文段落のみ
    return paras.filter(p => p.style === 'summery_body' && p.text.trim().length > 0)
                .map(p => p.text.startsWith('　')); // 全角スペースで始まるか
}

// 11. 引用
function extractInTextCitations(paras) {
    const text = paras.filter(p => p.style === 'summery_body').map(p => p.text).join('');
    // [Name Year: Page] format
    const hasFormat = /\[[^\]]+\s\d{4}:\s?[^\]]+\]/.test(text);
    return { hasFormat };
}

// 12. 改ページ
function extractPageBreaks(docXml) {
    return docXml.getElementsByTagName('w:br'); // w:type="page" チェックなどは簡易的に省略し存在有無のみ返す運用も可
}
