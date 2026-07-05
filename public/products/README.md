# Product images

Each product card shows the photo at `public/products/<slug>.jpg`, where `<slug>`
is the product's `slug` in `src/lib/mock-data.ts`.

## How to change an image or thumbnail

You have two options:

1. **Replace the file (easiest).**
   Drop your own image in this folder using the same filename, e.g. replace
   `public/products/iphone-13-128gb.jpg` with your photo. Square images
   (e.g. 600×600 or 800×800) look best. Keep the `.jpg` name.

2. **Point a product at a different image.**
   In `src/lib/mock-data.ts`, add an `image` field to any product. It accepts
   either a local `/public` path or a full URL:

   ```ts
   {
     id: "prod-iphone13",
     slug: "iphone-13-128gb",
     // ...
     image: "/products/my-iphone.jpg",        // local file in /public
     // image: "https://example.com/phone.jpg", // or a remote URL
   }
   ```

If an image is missing, the card automatically falls back to the branded
gradient + emoji placeholder — nothing breaks.

## About these default images

The bundled defaults were auto-sourced from open-source photos
(LoremFlickr → Flickr Creative Commons) as development placeholders. They are
category-relevant but not curated product shots. **Before going to production,
replace them with your own product photography or properly licensed images.**
