/* HEON ARCHIVE v1.2.6 · high-resolution landscape A4 38:31:31 PDF writer.
 * A new question starts in column 1 of a new page; its explanation starts
 * in column 2 and flows to column 3, then column 1 of a continuation page.
 * Korean fonts, source figures, and vector handwritten notes are rasterized
 * locally before being embedded as page images in a standards-compliant PDF.
 */
(()=>{'use strict';
  const PW=1684,PH=1190,RESOLUTION=2,MG=48,GAP=18,TOP=132,BOTTOM=PH-69;
  const usable=PW-MG*2-GAP*2, CW=[usable*.38,usable*.31,usable*.31];
  const X=[MG,MG+CW[0]+GAP,MG+CW[0]+GAP+CW[1]+GAP];
  const FONT='"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
  const BLUE='#215fcd',INK='#1b304d',MUTED='#62758d',LINE='#d7e1ef',PALE='#f4f7fc',GREEN='#137c5e';
  const encoder=new TextEncoder();
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  function wrap(ctx,value,width){
    const lines=[];
    for(const paragraph of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
      if(!paragraph){lines.push('');continue;}
      let line='';
      for(const char of paragraph){
        if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}
        line+=char;
      }
      lines.push(line);
    }
    return lines;
  }
  class Writer{
    constructor(){this.images=[];}
    async push(canvas){
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PDF JPEG 저장 실패')),'image/jpeg',.95));
      this.images.push(new Uint8Array(await blob.arrayBuffer()));
    }
    build(){
      const pieces=[],ofs=[0];let length=0;
      const add=v=>{const u=typeof v==='string'?encoder.encode(v):v;pieces.push(u);length+=u.length;};
      const begin=n=>{ofs[n]=length;add(`${n} 0 obj\n`);};const end=()=>add('\nendobj\n');
      const count=this.images.length;
      if(!count)throw Error('PDF 페이지 없음');
      add('%PDF-1.4\n%HEON-ARCHIVE\n');
      begin(1);add('<< /Type /Catalog /Pages 2 0 R >>');end();
      begin(2);add(`<< /Type /Pages /Count ${count} /Kids [`);
      for(let i=0;i<count;i++)add(`${3+i*3} 0 R `);add('] >>');end();
      for(let i=0;i<count;i++){
        const pid=3+i*3,iid=pid+1,cid=pid+2,img=this.images[i];
        begin(pid);add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);end();
        begin(iid);add(`<< /Type /XObject /Subtype /Image /Width ${PW*RESOLUTION} /Height ${PH*RESOLUTION} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);add(img);add('\nendstream');end();
        const stream='q\n841.89 0 0 595.28 0 0 cm\n/Im0 Do\nQ\n';
        begin(cid);add(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);end();
      }
      const xref=length;add(`xref\n0 ${count*3+3}\n0000000000 65535 f \n`);
      for(let i=1;i<=count*3+2;i++)add(String(ofs[i]).padStart(10,'0')+' 00000 n \n');
      add(`trailer\n<< /Size ${count*3+3} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(pieces,{type:'application/pdf'});
    }
  }
  class Painter{
    constructor(writer,title,mode){this.writer=writer;this.title=title;this.mode=mode;this.canvas=null;this.ctx=null;this.col=0;this.y=TOP;this.page=0;this.current='';}
    font(n=18,weight='400'){this.ctx.font=`${weight} ${n}px ${FONT}`;}
    async pageStart(continued=false){
      if(this.canvas){
        if(this.questionOverlayPage===this.page&&this.activeQuestionInk){
          this.drawInkOverlay(this.activeQuestionInk,X[0],TOP,CW[0],BOTTOM-TOP);
          this.activeQuestionInk=null;
        }
        if(this.evidenceOverlayPage===this.page&&this.activeEvidenceInk){
          this.drawInkOverlay(this.activeEvidenceInk,X[1],TOP,CW[1]+GAP+CW[2],BOTTOM-TOP);
          this.activeEvidenceInk=null;
        }
        await this.writer.push(this.canvas);this.canvas.width=0;
      }
      this.canvas=document.createElement('canvas');this.canvas.width=PW*RESOLUTION;this.canvas.height=PH*RESOLUTION;
      this.ctx=this.canvas.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas unavailable');
      this.ctx.scale(RESOLUTION,RESOLUTION);this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';
      this.page++;const c=this.ctx;c.fillStyle='#ffffff';c.fillRect(0,0,PW,PH);
      c.fillStyle=BLUE;c.fillRect(MG,44,7,34);this.font(23,'800');c.fillStyle=INK;c.fillText('HEON ARCHIVE',MG+19,69);
      this.font(14,'400');c.fillStyle=MUTED;const t=`${this.title} · ${this.mode} · ${this.page}쪽`;
      c.fillText(t,PW-MG-c.measureText(t).width,66);
      c.fillStyle=LINE;c.fillRect(MG,94,PW-MG*2,1);
      c.fillRect(MG,PH-42,PW-MG*2,1);
      if(continued){this.font(14,'700');c.fillStyle=BLUE;c.fillText(`${this.current} · 해설 계속`,MG,115);}
      this.y=TOP;this.col=0;
    }
    async nextCol(){if(this.questionPhase){await this.pageStart(true);return;}if(this.col<2){this.col++;this.y=TOP;}else await this.pageStart(true);}
    async ensure(h){if(!this.canvas)await this.pageStart();if(this.y+h>BOTTOM)await this.nextCol();}
    async heading(text){await this.ensure(38);this.font(17,'800');this.ctx.fillStyle=BLUE;this.ctx.fillText(text,X[this.col],this.y+18);this.y+=36;}
    async para(value,opts={}){
      const size=opts.size||18,line=opts.line||Math.round(size*1.53),after=opts.after??11,weight=opts.weight||'400';
      // Recalculate wrapped lines when changing columns.
      for(const paragraph of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
        let remaining=paragraph;
        if(!remaining){await this.ensure(line);this.y+=line;continue;}
        while(remaining.length){
          await this.ensure(line+3);this.font(size,weight);
          const width=CW[this.col]-6;let slice='';
          for(const char of remaining){if(slice&&this.ctx.measureText(slice+char).width>width)break;slice+=char;}
          if(!slice)slice=remaining[0];remaining=remaining.slice(slice.length);
          this.ctx.fillStyle=opts.color||INK;this.ctx.fillText(slice,X[this.col],this.y+size);this.y+=line;
        }
      }
      await this.ensure(after);this.y+=after;
    }
    async block(value,opts={}){
      const size=opts.size||16,line=Math.round(size*1.5),pad=10;
      for(const p of String(value||'').split('\n')){
        let remaining=p||' ';
        while(remaining){await this.ensure(line+pad*2+4);this.font(size,'600');
          const width=CW[this.col]-pad*2;let part='';
          for(const ch of remaining){if(part&&this.ctx.measureText(part+ch).width>width)break;part+=ch;}
          remaining=remaining.slice(part.length);
          const c=this.ctx;c.fillStyle=opts.bg||PALE;c.fillRect(X[this.col],this.y,CW[this.col],line+pad*2);
          c.fillStyle=opts.color||INK;c.fillText(part,X[this.col]+pad,this.y+pad+size);
          this.y+=line+pad*2+5;
        }
      }
    }
    async figure(url,label='그림',heightLimit=380){
      if(!url)return;
      let img=new Image();img.decoding='async';img.src=window.HeonProtected?await window.HeonProtected.getAssetURL(url):new URL(url,document.baseURI).href;
      try{await new Promise((ok,fail)=>{if(img.complete&&img.naturalWidth)return ok();img.onload=ok;img.onerror=fail;});}
      catch(_){await this.para(`이미지를 불러오지 못했습니다: ${label}`,{size:13,color:'#ab3244'});return;}
      const dimensions=()=>{const scale=Math.min((CW[this.col]-10)/img.naturalWidth,heightLimit/img.naturalHeight,1.6);return [img.naturalWidth*scale,img.naturalHeight*scale];};
      let [dw,dh]=dimensions();
      await this.ensure(dh+36);
      await this.para(label,{size:12,line:18,after:5,color:MUTED});
      [dw,dh]=dimensions();
      if(this.y+dh>BOTTOM){await this.nextCol();[dw,dh]=dimensions();}
      this.ctx.drawImage(img,X[this.col],this.y,dw,dh);this.y+=dh+14;
      img.src='';
    }
    // Paint the saved vector strokes directly on the problem / explanation columns.
    // No detached note box is printed. The screen and PDF use different text flows,
    // so handwritten positions are proportional to the corresponding content area.
    drawInkOverlay(region,x,y,w,h){
      if(!region?.strokes?.length||!this.ctx)return;
      const c=this.ctx,iw=region.width||1000,ih=region.height||1050;
      c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
      c.translate(x,y);c.scale(w/iw,h/ih);
      for(const stroke of region.strokes){
        const points=stroke.points||[];if(!points.length)continue;
        const shape=window.HeonInk?.outline?.(stroke)||[];
        c.beginPath();c.lineJoin='round';c.lineCap='round';
        c.fillStyle=c.strokeStyle=stroke.color||BLUE;c.lineWidth=stroke.width||5;
        c.globalAlpha=stroke.tool==='marker'?.26:1;
        if(shape.length>2){c.moveTo(shape[0][0],shape[0][1]);
          for(let i=1;i<shape.length;i++)c.lineTo(shape[i][0],shape[i][1]);c.closePath();c.fill();}
        else {c.moveTo(points[0][0],points[0][1]);
          for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);c.stroke();}
      }
      c.restore();
    }
    async questionStart(item,index,count){
      await this.pageStart();this.questionPhase=true;this.current=`${item.teacher||'교수님'} · ${item.label||index+1}`;
      this.activeQuestionInk=item.ink?.regions?.question||item.ink;
      this.questionOverlayPage=this.page;
      await this.para(`${this.current} · ${index+1}/${count}`,{size:18,weight:'800',color:BLUE,line:27});
      await this.heading('문제');await this.para(item.prompt||'',{size:17,weight:'600',line:29});
      for(const f of item.figures||[])await this.figure(f.src,f.label,290);
      for(const ch of item.choices||[])await this.block(`${ch.symbol||''} ${ch.text||''}`,{size:15,bg:ch.correct?'#e8f6f0':PALE});
      if(this.activeQuestionInk&&this.questionOverlayPage===this.page){
        this.drawInkOverlay(this.activeQuestionInk,X[0],TOP,CW[0],BOTTOM-TOP);
      }
      this.activeQuestionInk=null;this.questionOverlayPage=null;
      // If the question consumed further pages, the explanation begins in column 2
      // on the last question page (the problem column itself remains separate).
      this.questionPhase=false;this.col=1;this.y=TOP;
      this.activeEvidenceInk=item.ink?.regions?.evidence||null;
      this.evidenceOverlayPage=this.page;
      await this.heading('정답 및 해설');
      await this.block(`정답: ${item.answer||'미확정'} · 내 답안: ${item.picked||'미제출'}`,{size:16,bg:'#e9f7f0',color:GREEN});
      await this.para(item.explanation||'등록된 해설이 없습니다.',{size:17,line:27});
      if(item.reasons?.length){await this.heading('선택지별 해설');for(const r of item.reasons)await this.para(`${r.symbol} ${r.text}`,{size:16,line:25});}
      if(item.explanationImages?.length){await this.heading('추가 해설 이미지');for(const f of item.explanationImages)await this.figure(f.src,f.label,330);}
      const lectures=Array.isArray(item.evidence)?item.evidence:(item.evidence?[item.evidence]:[]);
      if(lectures.length){
        await this.heading(`강의안 근거 · ${lectures.length}개`);
        for(let i=0;i<lectures.length;i++){
          const lecture=lectures[i];
          await this.para(`${i+1}/${lectures.length} · ${lecture.label||'강의안'}`,{size:13,line:20,color:MUTED});
          if(lecture.src)await this.figure(lecture.src,`강의안 발췌 ${i+1}/${lectures.length}`,420);
          else await this.para('첨부된 강의안 이미지가 없습니다.',{size:13,color:MUTED});
        }
      }
      if(this.activeEvidenceInk&&this.evidenceOverlayPage===this.page){
        this.drawInkOverlay(this.activeEvidenceInk,X[1],TOP,CW[1]+GAP+CW[2],BOTTOM-TOP);
      }
      this.activeEvidenceInk=null;this.evidenceOverlayPage=null;
    }
    async finish(){if(this.canvas){await this.writer.push(this.canvas);this.canvas.width=0;this.canvas=null;}}
  }
  async function generate({title,modeLabel,items,onProgress}){
    if(!items?.length)throw Error('PDF로 저장할 문항이 없습니다.');
    const writer=new Writer(),p=new Painter(writer,title,modeLabel);
    for(let i=0;i<items.length;i++){await p.questionStart(items[i],i,items.length);onProgress?.(i+1,items.length);if(i%2===0)await tick();}
    await p.finish();return {blob:writer.build(),pages:writer.images.length};
  }
  window.HeonPdfExport=Object.freeze({generate});
})();
