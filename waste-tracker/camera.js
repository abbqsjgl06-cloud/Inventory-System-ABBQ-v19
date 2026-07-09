const Camera = (() => {
let currentPhoto=null;
function init(){
 const input=document.getElementById("photoInput");
 if(input) input.addEventListener("change",selectPhoto);
 const galleryInput=document.getElementById("photoInputGallery");
 if(galleryInput) galleryInput.addEventListener("change",selectPhoto);
 const takeBtn=document.getElementById("takePhotoBtn");
 if(takeBtn) takeBtn.addEventListener("click",()=>{ if(input) input.click(); });
 const galleryBtn=document.getElementById("pickGalleryBtn");
 if(galleryBtn) galleryBtn.addEventListener("click",()=>{ if(galleryInput) galleryInput.click(); });
 const removeBtn=document.getElementById("removePhotoBtn");
 if(removeBtn) removeBtn.addEventListener("click",clear);
}
async function selectPhoto(e){
 const file=e.target.files[0];
 if(!file)return;
 try{
  UI.showLoading();
  currentPhoto=await compress(file);
  preview(currentPhoto);
  UI.hideLoading();
 }catch(err){
  console.error(err);
  UI.hideLoading();
  UI.toast("Foto gagal diproses. Coba gunakan foto lain.","error");
 }
}
function compress(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=function(){
   const img=new Image();
   img.onload=function(){
    const canvas=document.createElement("canvas");
    let scale=Math.min(1,1000/img.width,1000/img.height);
    canvas.width=img.width*scale;
    canvas.height=img.height*scale;
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    let quality=0.6;
    let result=canvas.toDataURL("image/jpeg",quality);
    // Safety margin under Firestore's 1MB per-document limit.
    // Step quality down further if still too large.
    while(result.length > 700000 && quality > 0.3){
        quality -= 0.1;
        result=canvas.toDataURL("image/jpeg",quality);
    }
    if(result.length > 900000){
        reject(new Error("Foto masih terlalu besar setelah dikompres. Coba gunakan foto lain."));
        return;
    }
    resolve(result);
   };
   img.onerror=reject;
   img.src=reader.result;
  };
  reader.onerror=reject;
  reader.readAsDataURL(file);
 });
}
function preview(src){
 const img=document.getElementById("photoPreview");
 if(img){img.src=src;img.style.display="block";}
}
function get(){return currentPhoto;}
function set(src){currentPhoto=src;preview(src);}
function clear(){
 currentPhoto=null;
 const img=document.getElementById("photoPreview");
 if(img)img.src="";
 const input=document.getElementById("photoInput");
 if(input) input.value="";
 const galleryInput=document.getElementById("photoInputGallery");
 if(galleryInput) galleryInput.value="";
}
return {init,get,set,clear};
})();