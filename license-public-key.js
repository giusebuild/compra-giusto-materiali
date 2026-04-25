// Public key used by the browser to verify signed Pro certificates.
// Run: node tools/generate-license-keys.js --write
// Then commit the updated license-public-key.js and set LICENSE_PRIVATE_JWK on Netlify.
window.COMPRA_GIUSTO_LICENSE_PUBLIC_JWK = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "xlxa7MYGqACnbfuOKGWUjNz-dlPqr1YAyfH4nTFbhQA",
  y: "s8wq6ds-gDldwhw7O5qyaokeb7rer6DwFQ29MEZZ2qc",
  crv: "P-256",
};
