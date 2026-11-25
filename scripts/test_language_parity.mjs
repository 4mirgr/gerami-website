import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const origin = process.env.PARITY_TEST_ORIGIN || 'http://127.0.0.1:4173';
const routes = [
  '/', '/pages/blog.html', '/pages/about.html', '/projects', '/pages/account.html',
  '/pages/contact.html', '/pages/appointments.html', '/pages/services.html', '/pages/beyond.html',
  '/pages/privacy.html', '/topics/', '/topics/pulmonology/', '/topics/pulmonology/asthma/',
];
const {articles} = JSON.parse(await readFile(new URL('../content/articles.json', import.meta.url)));
for (const audience of ['patients', 'professional']) {
  const sample = articles.find(post => post.status === 'published' && post.audience === audience);
  if (sample) routes.push(sample.url || '/articles/' + sample.slug + '/');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});

async function snapshot(page, language) {
  await page.waitForFunction(lang => document.documentElement.lang === lang, language);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const {documentElement: root} = document;
    const width = root.clientWidth;
    const shown = node => {
      const rectangle = node.getBoundingClientRect();
      return rectangle.width > 0 && rectangle.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };
    const visible = selector => [...document.querySelectorAll(selector)].filter(shown);
    const key = node => node.id || node.getAttribute('data-site-section') || node.tagName + '.' + node.className;
    const cards = visible('main .glass-surface, main .card, main .reader-sheet, main .discussion, main .project-feature');
    const images = visible('.site-header img, main img, .site-footer img').map(node => {
      // An explicit pair denotes the same artwork localized for two audiences.
      if (node.dataset.srcFa && node.dataset.srcEn) {
        const expected = root.lang === 'en' ? node.dataset.srcEn : node.dataset.srcFa;
        if (node.getAttribute('src') !== expected) throw Error('Wrong localized artwork: ' + expected);
        return node.dataset.srcFa + '|' + node.dataset.srcEn;
      }
      return node.getAttribute('src');
    });
    const icons = visible('.site-header svg, .site-header .ui-material-icon, main svg, .site-footer svg').map(icon =>
      icon.tagName.toLowerCase() === 'svg' ? icon.getAttribute('viewBox') + ':' + icon.childElementCount : icon.className);
    const shells = visible('.site-header, main, .site-footer, .reader-sheet, .account-card, .project-feature, .atlas-heading');
    const boxes = shells.map(node => {
      const rect = node.getBoundingClientRect();
      return {key: key(node), left: rect.left, right: width - rect.right, width: rect.width};
    });
    return {
      language: root.lang, direction: getComputedStyle(root).direction, width, overflow: root.scrollWidth - width,
      cards: cards.map(key), images, icons, boxes, headingCount: visible('main h1').length,
    };
  });
}

// Read the canonical article artwork, including the build's smaller derivative when present.
const published = articles.filter(post => post.status === 'published');
const postPath = post => post.url || '/articles/' + post.slug + '/';
const assetsFor = new Map();
async function coverPaths(page, post) {
  if (!assetsFor.has(post.slug)) {
    const html = await (await page.request.get(origin + postPath(post))).text();
    const covers = await page.evaluate(html => {
      const article = new DOMParser().parseFromString(html, 'text/html');
      return ['.article-cover img', '.article-cover source'].flatMap(selector => {
        const node = article.querySelector(selector);
        return node ? [node.getAttribute('src') || node.getAttribute('srcset')] : [];
      });
    }, html);
    assert.ok(covers.includes(post.image), 'Canonical page must carry its actual approved photograph: ' + post.slug);
    assetsFor.set(post.slug, covers);
  }
  return assetsFor.get(post.slug);
}

async function verifyPulmonology(page) {
  const {categories} = JSON.parse(await readFile(new URL('../backend/editorial/functions/gerami-editorial/taxonomy.json', import.meta.url)));
  const category = categories.find(item => item.root.id === 'pulmonology');
  const members = published.filter(post => category.topics.some(topic => topic.id === post.topic) || post.topic === category.root.id);
  const tiles = page.locator('.atlas-subtopics a.atlas-subtopic');
  assert.equal(await tiles.count(), category.topics.length, 'All pulmonology subtopics have visible cards');
  for (const topic of category.topics) {
    const tile = tiles.filter({has: page.locator('.topic-chevron')}).and(page.locator('[href="/topics/pulmonology/' + topic.id + '/"]'));
    assert.ok(await tile.isVisible(), topic.id + ' missing subtopic card');
    const covers = members.filter(post => post.topic === topic.id && post.image);
    const images = tile.locator('img.post-cover');
    if (!covers.length) {
      assert.equal(await images.count(), 0, 'Do not attach another topic’s image to ' + topic.id);
      continue;
    }
    assert.ok(await images.isVisible(), topic.id + ' missing illustrated subtopic');
    const allowed = (await Promise.all(covers.map(post => coverPaths(page, post)))).flat();
    assert.ok(allowed.includes(await images.getAttribute('src')), topic.id + ' wrong subtopic artwork');
  }
  const cards = page.locator('.atlas-post-grid article.post-card');
  assert.equal(await cards.count(), members.length, 'Pulmonology lists each published article');
  for (const post of members) {
    const card = cards.and(page.locator('[data-post="' + post.slug + '"]'));
    assert.ok(await card.isVisible(), post.slug + ' missing article card');
    assert.equal(await card.locator('h4 a').getAttribute('href'), postPath(post));
    if (post.image) {
      const image = card.locator('img.post-cover');
      assert.ok(await image.isVisible(), post.slug + ' missing post thumbnail');
      assert.ok((await coverPaths(page, post)).includes(await image.getAttribute('src')), post.slug + ' wrong thumbnail');
    }
  }
}

async function verifyArchiveFallback(context) {
  const page = await context.newPage();
  const path = '/pages/blog.html';
  const original = await (await page.request.get(origin + path)).text();
  if (!original.includes(' data-recent-links')) {
    // Source previews serve hand-written HTML. Build the same archive markup used in production.
    const baked = execFileSync('python3', ['-c', [
      'import sys; from pathlib import Path',
      "sys.path.insert(0, 'scripts'); from site_studio import bake_settings",
      "print(bake_settings(Path('.'), Path('pages/blog.html').read_text(), 'blog'))",
    ].join('\n')], {encoding:'utf8'});
    await page.route(origin + path, route => route.fulfill({contentType:'text/html', body:baked}));
  }
  await page.route('**/content/articles.json', route => route.abort());
  await page.goto(origin + path);
  const archive = page.locator('main [data-recent-links]');
  if (published.length) {
    await archive.waitFor();
    const cards = archive.locator('li.card');
    for (const lang of ['fa','en']) {
      if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('[data-language-toggle]').click();
      await snapshot(page,lang);
      assert.equal(await cards.count(), published.length);
      for (const post of published) {
        const link = cards.locator('a[href="' + postPath(post) + '"]');
        const row = cards.filter({has: page.locator('a[href="' + postPath(post) + '"]')});
        assert.ok(await row.isVisible(), lang + ' missing fallback card for ' + post.slug);
        assert.equal(await link.innerText(), (post['title_' + lang] || post.title_fa).slice(0,150));
        assert.ok((await row.locator('.post-excerpt').innerText()).length > 0);
        if (post.image) assert.ok((await coverPaths(page, post)).includes(await row.locator('img').getAttribute('src')));
      }
    }
  }
  await page.close();
}

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 900}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    // External applications and provider availability are independent of the public site's layout.
    await page.route('**/api/account/providers', route => route.fulfill({json: {google: true}}));
    for (const path of routes) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      await page.waitForSelector('.toolbar-ready', {state:'attached'});
      if (articles.some(post => post.status === 'published') && (path === '/' || path === '/pages/blog.html')) {
        if (path === '/') await page.locator('#recent-posts').scrollIntoViewIfNeeded();
        await page.locator('.post-card').first().waitFor({state:'attached'});
      }
      if (path === '/pages/about.html') await page.locator('.career-entry').first().waitFor({state:'attached'});
      if (path === '/pages/account.html') await page.locator('[data-account-form=login]').waitFor();
      const compare = async (lang, baseline) => {
        const current = await snapshot(page, lang);
        const label = path + ' ' + width + 'px ' + lang;
        assert.equal(current.direction, lang === 'fa' ? 'rtl' : 'ltr', label);
        assert.ok(current.overflow <= 1, label + ' horizontal overflow: ' + current.overflow);
        assert.ok(current.headingCount > 0, label + ' missing main heading');
        assert.ok(current.images.length && current.icons.length, label + ' missing shared visual controls');
        for (const box of current.boxes) assert.ok(box.left >= -1 && box.right >= -1, label + ' out of bounds: ' + box.key);
        if (baseline) {
          for (const property of ['cards', 'images', 'icons', 'headingCount']) {
            assert.deepEqual(current[property], baseline[property], label + ' changed ' + property);
          }
          assert.deepEqual(current.boxes.map(box => box.key), baseline.boxes.map(box => box.key), label + ' changed containers');
          current.boxes.forEach((box, i) => {
            assert.ok(Math.abs(box.width - baseline.boxes[i].width) <= 2, label + ' changed container width: ' + box.key);
          });
        }
        return current;
      };
      const fa = await compare('fa');
      if (path === '/topics/pulmonology/') await verifyPulmonology(page);
      await page.locator('[data-language-toggle]').click();
      await compare('en', fa);
      if (path === '/topics/pulmonology/') await verifyPulmonology(page);
      await page.locator('[data-language-toggle]').click();
      await compare('fa', fa);
    }
    await verifyArchiveFallback(context);
    await context.close();
  }
  console.log('PASS public FA/EN layout: ' + routes.length + ' routes, mobile and desktop, cards, images, icons, bounds and reversible direction.');
} finally {
  await browser.close();
}
