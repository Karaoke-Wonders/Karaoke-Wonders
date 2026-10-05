// schema.js
const siteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Karaoke Wonders",
  "url": "https://karaokewonders.com"
};

// Create the script tag and inject it into the <head>
const script = document.createElement('script');
script.type = 'application/ld+json';
script.text = JSON.stringify(siteSchema);
document.head.appendChild(script);