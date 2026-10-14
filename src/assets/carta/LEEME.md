Páginas de la carta para `/carta`, sacadas de `public/carta-horno-san-lorenzo.pdf`.

Desde el 14-10-2026 la carta es «carta final.pdf» (hecha en Google, tres páginas
apaisadas), copiada tal cual a `public/` (1 MB, no hace falta comprimirla); para
las imágenes basta el paso 3 con `-scale-to-x 2000`.

Antes venía del obrador en PowerPoint (`CARTA_PRECIOS_FINAL.pptx`, septiembre
de 2026). Para rehacer el PDF y las imágenes desde un pptx:

1. Poppins y Lora tienen que estar instaladas (el pptx las trae incrustadas en
   un formato que LibreOffice no lee). Están en Google Fonts; Lora hay que
   instalarla en estático (Regular, Bold, Italic, Bold Italic).
2. PDF, y después comprimido (de ~3,7 MB a ~1,2 MB sin pérdida visible):

       soffice --headless --convert-to pdf --outdir /tmp CARTA_PRECIOS_FINAL.pptx
       gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook \
          -dDetectDuplicateImages=true \
          -sOutputFile=public/carta-horno-san-lorenzo.pdf /tmp/CARTA_PRECIOS_FINAL.pdf

3. Imágenes (borrando antes las viejas):

       rm src/assets/carta/pagina-*.jpg
       pdftoppm -jpeg -jpegopt quality=85 -scale-to-x 1200 -scale-to-y -1 \
         public/carta-horno-san-lorenzo.pdf src/assets/carta/pagina

`soffice` está en `/Applications/LibreOffice.app/Contents/MacOS/`.
