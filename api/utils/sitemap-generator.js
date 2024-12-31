require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;

// Set your API base URL from the environment variables
const API_URL = process.env.API_URL

const generateSitemap = async () => {
    try {
        // Fetch posts from your API
        const response = await axios.get(`${API_URL}/posts`);
        const posts = response.data;

        // Define static and dynamic URLs for the sitemap
        const urls = [
            {
                loc: 'https://christianwrites.com',
                lastmod: new Date().toISOString(),
                changefreq: 'weekly',
                priority: 1.0,
            },
            {
                loc: 'https://christianwrites.com/blog',
                lastmod: new Date().toISOString(),
                changefreq: 'weekly',
                priority: 0.8,
            },
            ...posts.map((post) => ({
                loc: `https://christianwrites.com/blog/${post._id}`,
                lastmod: new Date().toISOString(),
                changefreq: 'daily',
                priority: 0.6,
            })),
        ];

        // Generate the sitemap XML structure
        const sitemapContent = `
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${urls
                .map(
                    (url) => `
                <url>
                    <loc>${url.loc}</loc>
                    <lastmod>${url.lastmod}</lastmod>
                    <changefreq>${url.changefreq}</changefreq>
                    <priority>${url.priority}</priority>
                </url>`
                )
                .join('')}
        </urlset>`.trim();

        // Write the sitemap to the public folder
        await fs.writeFile('./public/sitemap.xml', sitemapContent, 'utf-8');
        console.log('sitemap.xml has been successfully generated.');
    } catch (error) {
        console.error('Error generating sitemap:', error);
    }
};

// Run the generator
generateSitemap();
