/* ===================== 眠窗 · 静修朗读播放模块 =====================

   跟其它场景不一样，这两段不是"环境音循环"，是"一段完整的诵读/朗读"，
   所以做成独立的播放卡片（点播放、播完就停），不接入音量滑块混音系统，
   也不会因为切场景就被打断——这是刻意的设计，不是漏做了滑块。

   ⚠️ 现状：这里没有任何真实音频，两张卡片会显示"内容准备中"，点了没反应。
   这是有意为之——我这边没有联网下载能力，也没有语音合成工具，更重要的是：
   古兰经的诵读涉及塔吉威德（诵读规则）的准确性，圣经朗读涉及译本选择，
   这两件事都必须用真实、有明确授权的录音，不能由我随便生成或找一段拼凑上去。

   ---- 等你拿到合规音频后，怎么接上 ----
   1. 把文件放进 www/assets/audio/，建议命名：
        quran-sample.mp3   —— 古兰经选段（阿拉伯语诵读）
        bible-sample.mp3   —— 圣经选段（英语朗读）
   2. 把下面 FAITH_READINGS 里对应条目的 file 从 null 改成文件名
   3. 同时填好 attribution 字段（诵读者姓名 / 圣经译本名称，这是版权方通常要求的最低署名义务，
      别漏掉——这不是可选项，是很多授权协议的强制条款）
   4. 刷新页面，卡片会自动从"内容准备中"变成可点播放，不需要改其它代码

   ---- 去哪儿找合规音频（不是我帮你下载，是给你一个可以自己去核实的方向） ----
   - 古兰经：api.quran.com 这类平台列出了各诵读者的音频及各自的使用条款，
     commercial（你这是收费App，属于商用）场景务必逐条确认清楚，
     拿不准就直接联系对应诵读者/所属机构书面确认；
     "Quran 经文文本"本身多数来源允许自由使用，但"诵读录音"版权单独算，别混为一谈
   - 圣经：可以看 Faith Comes By Hearing（bible.is）这类机构是否提供免费/低成本的商用授权，
     或者找 LibriVox 上明确标注公版（Public Domain）的英王钦定本(KJV)朗读版本——
     公版朗读版本免费好用，但音质和朗读水准参差不齐，正式上线前建议自己先完整听一遍
================================================================= */

const FAITH_READINGS = [
  {
    id: 'quran',
    titleKey: 'faithQuranTitle',
    file: null, // ⚠️ 改成 'assets/audio/quran-sample.mp3' 即可生效
    attribution: null, // ⚠️ 填诵读者姓名 + 版本信息，例如 '诵读者：XXX · 依据 XXX 版古兰经'
  },
  {
    id: 'bible',
    titleKey: 'faithBibleTitle',
    file: null, // ⚠️ 改成 'assets/audio/bible-sample.mp3' 即可生效
    attribution: null, // ⚠️ 填朗读者/译本信息，例如 '朗读者：XXX · King James Version'
  },
];

let faithAudioEl = null;
let faithPlayingId = null;

function renderFaithCards(){
  const container = document.getElementById('faithCards');
  if(!container) return;
  container.innerHTML = '';
  FAITH_READINGS.forEach(item=>{
    const ready = !!item.file;
    const card = document.createElement('div');
    card.className = 'faith-card' + (ready ? '' : ' pending');
    card.innerHTML = `
      <div class="faith-play" data-id="${item.id}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg>
      </div>
      <div class="faith-info">
        <div class="faith-title">${I18N.t(item.titleKey)}</div>
        <div class="faith-attribution">${ready ? (item.attribution || '') : I18N.t('faithPending')}</div>
      </div>
    `;
    if(ready){
      card.querySelector('.faith-play').addEventListener('click', ()=>toggleFaithPlay(item));
    }
    container.appendChild(card);
  });
}

function toggleFaithPlay(item){
  if(!faithAudioEl){
    faithAudioEl = new Audio();
    faithAudioEl.addEventListener('ended', ()=>{ faithPlayingId=null; renderFaithCards(); });
  }
  if(faithPlayingId===item.id){
    faithAudioEl.pause();
    faithPlayingId=null;
  } else {
    faithAudioEl.src = item.file;
    faithAudioEl.play().catch(()=>{});
    faithPlayingId = item.id;
  }
  renderFaithCards();
}

window.renderFaithCards = renderFaithCards;
