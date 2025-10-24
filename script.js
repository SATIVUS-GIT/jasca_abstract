<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta http-equiv="Content-Style-Type" content="text/css">
  <title></title>
  <meta name="Generator" content="Cocoa HTML Writer">
  <meta name="CocoaVersion" content="2685.1">
  <style type="text/css">
    p.p1 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px 'Hiragino Sans'; -webkit-text-stroke: #000000}
    p.p2 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica; -webkit-text-stroke: #000000}
    p.p3 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica; -webkit-text-stroke: #000000; min-height: 14.0px}
    span.s1 {font: 12.0px Helvetica; font-kerning: none}
    span.s2 {font-kerning: none}
    span.s3 {font: 12.0px 'Hiragino Sans'; font-kerning: none}
    span.s4 {font: 12.0px 'Lucida Grande'; font-kerning: none}
    span.s5 {font: 12.0px 'Zapf Dingbats'; font-kerning: none}
  </style>
</head>
<body>
<p class="p1"><span class="s1">// pdf.js</span><span class="s2">ライブラリの「</span><span class="s1">worker</span><span class="s2">」スクリプトの場所を指定します。</span></p>
<p class="p1"><span class="s1">// </span><span class="s2">これは、重い処理をバックグラウンドで行うために必要です。</span></p>
<p class="p2"><span class="s2">pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">// --- DOM</span><span class="s3">要素の取得</span><span class="s2"> ---</span></p>
<p class="p2"><span class="s2">const pdfUpload = document.getElementById('pdf-upload');</span></p>
<p class="p2"><span class="s2">const resultsDiv = document.getElementById('results');</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">// --- </span><span class="s3">イベントリスナーの設定</span><span class="s2"> ---</span></p>
<p class="p1"><span class="s1">// </span><span class="s2">ファイルが選択されたら、</span><span class="s1">checkPdf</span><span class="s2">関数を実行</span></p>
<p class="p2"><span class="s2">pdfUpload.addEventListener('change', (event) =&gt; {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const file = event.target.files[0];</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (file &amp;&amp; file.type === 'application/pdf') {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>checkPdf(file);</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p2"><span class="s2">});</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* PDF</span><span class="s2">を解析し、全チェックを実行するメイン関数</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* @param {File} file - </span><span class="s3">アップロードされた</span><span class="s2">PDF</span><span class="s3">ファイル</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">async function checkPdf(file) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>resultsDiv.innerHTML = '&lt;p&gt;PDF</span><span class="s3">を解析中です</span><span class="s2">...&lt;/p&gt;'; // </span><span class="s3">解析開始を通知</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const fileReader = new FileReader();</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>fileReader.onload = async (event) =&gt; {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>try {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>const typedArray = new Uint8Array(event.target.result);</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>const pdf = await pdfjsLib.getDocument(typedArray).promise;</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// --- 1. </span><span class="s3">全テキストの抽出</span><span class="s2"> ---</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>// </span><span class="s2">まず</span><span class="s1">PDF</span><span class="s2">内の全テキストを結合して取得します</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>let fullText = '';</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>for (let i = 1; i &lt;= pdf.numPages; i++) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">                </span>const page = await pdf.getPage(i);</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">                </span>const textContent = await page.getTextContent();</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">                </span>const pageText = textContent.items.map(item =&gt; item.str).join(' ');</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">                </span>fullText += pageText + ' ';</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// --- 2. </span><span class="s3">チェックの実行</span><span class="s2"> ---</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>const results = []; // </span><span class="s3">チェック結果を格納する配列</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">全体を</span><span class="s2">A4</span><span class="s3">縦長</span><span class="s2">1</span><span class="s3">枚に収めている</span><span class="s2"> [cite: 4, 33]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>results.push(checkPageCount(pdf.numPages));</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">            </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">本文の最低字数</span><span class="s2"> (</span><span class="s3">日本語</span><span class="s2">1500</span><span class="s3">字</span><span class="s2"> / </span><span class="s3">英語</span><span class="s2">500</span><span class="s3">ワード</span><span class="s2">) [cite: 3, 32]</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>// ※</span><span class="s2">注意</span><span class="s1">: </span><span class="s2">この簡易版ではヘッダー等を除外せず、全テキストでカウントしています</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>results.push(checkTextLength(fullText));</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">要旨に注と図版は入れない</span><span class="s2"> [cite: 6, 34]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// ※</span><span class="s3">「注」の文字の有無のみチェック</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>results.push(checkProhibitedItems(fullText));</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">アルファベットと数字は、すべて半角</span><span class="s2"> [cite: 8, 39]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>results.push(checkHalfWidthChars(fullText));</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">キーワード</span><span class="s2"> (3~5</span><span class="s3">語</span><span class="s2">) </span><span class="s3">を必ず記入</span><span class="s2"> [cite: 5, 34]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// ※</span><span class="s3">「キーワード</span><span class="s2">:</span><span class="s3">」または「</span><span class="s2">Keywords:</span><span class="s3">」の存在のみチェック</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>results.push(checkKeywords(fullText));</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>// --- 3. </span><span class="s3">結果の表示</span><span class="s2"> ---</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>displayResults(results);</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>} catch (error) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>console.error('PDF</span><span class="s3">の解析に失敗しました</span><span class="s2">:', error);</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>resultsDiv.innerHTML = '&lt;p class="fail"&gt;PDF</span><span class="s3">の解析に失敗しました。ファイルが破損している可能性があります。</span><span class="s2">&lt;/p&gt;';</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>}</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>};</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>fileReader.readAsArrayBuffer(file);</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* </span><span class="s2">チェック結果を画面に表示する</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* @param {Array} results - { pass: boolean, message: string } </span><span class="s3">の配列</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function displayResults(results) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>resultsDiv.innerHTML = ''; // </span><span class="s3">既存の結果をクリア</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (results.length === 0) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>resultsDiv.innerHTML = '&lt;p&gt;</span><span class="s3">チェック項目が見つかりませんでした。</span><span class="s2">&lt;/p&gt;';</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return;</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>results.forEach(result =&gt; {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>const p = document.createElement('p');</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>p.textContent = result.message;</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>p.className = result.pass ? 'pass' : 'fail';</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>resultsDiv.appendChild(p);</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>});</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p1"><span class="s1">// --- </span><span class="s2">ここから下は個別のチェック関数群</span><span class="s1"> ---</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">全体を</span><span class="s2">A4</span><span class="s3">縦長</span><span class="s2">1</span><span class="s3">枚に収めているか</span><span class="s2"> [cite: 4, 33]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function checkPageCount(numPages) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (numPages === 1) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: true, message: '</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">ページ数</span><span class="s2">: 1</span><span class="s3">ページです。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: false, message: `</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">ページ数</span><span class="s2">: 1</span><span class="s3">ページである必要がありますが、</span><span class="s2">${numPages}</span><span class="s3">ページ検出されました。</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">本文の最低字数</span><span class="s2"> [cite: 3, 32]</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* (</span><span class="s2">簡易版</span><span class="s1">: </span><span class="s2">全テキストでカウント</span><span class="s1">)</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function checkTextLength(text) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const charCount = text.replace(/\s/g, '').length; // </span><span class="s3">スペースを除いた文字数</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// </span><span class="s2">簡易的に英語か日本語かを判定</span><span class="s1"> (</span><span class="s2">アルファベットが多いか</span><span class="s1">)</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (alphaRatio &gt; 0.5) { // </span><span class="s3">英語と判定</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>const wordCount = text.trim().split(/\s+/).length;</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>if (wordCount &gt;= 500) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>return { pass: true, message: `</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">最低ワード数</span><span class="s2"> (</span><span class="s3">英語</span><span class="s2">): 500</span><span class="s3">ワード以上（現在</span><span class="s2"> ${wordCount}</span><span class="s3">ワード）</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>return { pass: false, message: `</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">最低ワード数</span><span class="s2"> (</span><span class="s3">英語</span><span class="s2">): 500</span><span class="s3">ワード以上必要ですが、</span><span class="s2">${wordCount}</span><span class="s3">ワードしか検出されませんでした。</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>}</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>} else { // </span><span class="s3">日本語と判定</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>if (charCount &gt;= 1500) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>return { pass: true, message: `</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">最低文字数</span><span class="s2"> (</span><span class="s3">日本語</span><span class="s2">): 1500</span><span class="s3">字以上（現在</span><span class="s2"> ${charCount}</span><span class="s3">字）</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">            </span>return { pass: false, message: `</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">最低文字数</span><span class="s2"> (</span><span class="s3">日本語</span><span class="s2">): 1500</span><span class="s3">字以上必要ですが、</span><span class="s2">${charCount}</span><span class="s3">字しか検出されませんでした。</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>}</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">要旨に「注」を入れていないか</span><span class="s2"> [cite: 6, 34]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function checkProhibitedItems(text) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (text.includes('</span><span class="s3">注</span><span class="s2">')) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: false, message: '</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">禁止項目</span><span class="s2">: </span><span class="s3">「注」という文字が検出されました。注は入れられません。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: true, message: '</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">禁止項目</span><span class="s2">: </span><span class="s3">「注」の文字は検出されませんでした。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// ※</span><span class="s2">図版の検出は、より高度な解析が必要なため省略しています</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* [</span><span class="s2">ルール</span><span class="s1">] </span><span class="s2">アルファベットと数字は、すべて半角か</span><span class="s1"> [cite: 8, 39]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function checkHalfWidthChars(text) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const fullWidthChars = text.match(/[</span><span class="s3">０</span><span class="s2">-</span><span class="s3">９Ａ</span><span class="s2">-</span><span class="s3">Ｚａ</span><span class="s2">-</span><span class="s3">ｚ</span><span class="s2">]/g); // </span><span class="s3">全角の英数字</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (fullWidthChars) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: false, message: `</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">文字幅</span><span class="s2">: </span><span class="s3">全角の英数字が検出されました</span><span class="s2"> (</span><span class="s3">例</span><span class="s2">: ${fullWidthChars[0]})</span><span class="s3">。すべて半角にしてください。</span><span class="s2">` };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: true, message: '</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">文字幅</span><span class="s2">: </span><span class="s3">全角の英数字は検出されませんでした。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p2"><span class="s2">}</span></p>
<p class="p3"><span class="s2"></span><br></p>
<p class="p2"><span class="s2">/**</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>* [</span><span class="s3">ルール</span><span class="s2">] </span><span class="s3">キーワードが記入されているか</span><span class="s2"> [cite: 5, 34]</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p2"><span class="s2">function checkKeywords(text) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const hasJp = text.includes('</span><span class="s3">キーワード</span><span class="s2">:');</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>const hasEn = text.includes('Keywords:');</span></p>
<p class="p3"><span class="s2"><span class="Apple-converted-space">    </span></span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>if (hasJp || hasEn) {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: true, message: '</span><span class="s4">✓</span><span class="s2"> </span><span class="s3">キーワード</span><span class="s2">: </span><span class="s3">「キーワード</span><span class="s2">:</span><span class="s3">」または「</span><span class="s2">Keywords:</span><span class="s3">」の表記が見つかりました。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>} else {</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">        </span>return { pass: false, message: '</span><span class="s5">✗</span><span class="s2"> </span><span class="s3">キーワード</span><span class="s2">: </span><span class="s3">「キーワード</span><span class="s2">:</span><span class="s3">」または「</span><span class="s2">Keywords:</span><span class="s3">」の表記が見つかりませんでした。</span><span class="s2">' };</span></p>
<p class="p2"><span class="s2"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p2"><span class="s2">}</span></p>
</body>
</html>
