"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * WordPress WXR (XML) import script for Payload CMS.
 *
 * Usage:
 *   # install helpers once
 *   yarn add -D ts-node slugify fast-xml-parser
 *
 *   # run the script (adjust --file path if needed)
 *   npx ts-node --esm scripts/migrate-wp.ts --file "Imports/staterepresentativevincentcandelora.WordPress.2025-07-14.xml"
 *
 * Environment variables required:
 *   PAYLOAD_SECRET   – your Payload secret (same as .env)
 *   MONGODB_URI      – Mongo connection string
 */
require("dotenv/config");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_process_1 = require("node:process");
var slugify_1 = require("slugify");
var fast_xml_parser_1 = require("fast-xml-parser");
var payload_1 = require("payload");
function parseArgs() {
    var fileIdx = node_process_1.default.argv.findIndex(function (a) { return a === '--file'; });
    if (fileIdx === -1 || !node_process_1.default.argv[fileIdx + 1]) {
        console.error('❌  Usage: ts-node migrate-wp.ts --file <path-to-wxr.xml>');
        node_process_1.default.exit(1);
    }
    return { file: node_process_1.default.argv[fileIdx + 1] };
}
var filePath = parseArgs().file;
var absPath = node_path_1.default.isAbsolute(filePath) ? filePath : node_path_1.default.join(node_process_1.default.cwd(), filePath);
if (!node_fs_1.default.existsSync(absPath)) {
    console.error("\u274C  File not found: ".concat(absPath));
    node_process_1.default.exit(1);
}
/** ------------------------- Payload bootstrap ------------------------ */
(function () { return __awaiter(void 0, void 0, void 0, function () {
    /** ------------------------- Helpers --------------------------------- */
    function getTenantIdBySlug(slug) {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, payload_1.default.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1 })];
                    case 1:
                        res = _a.sent();
                        if (!res.totalDocs) {
                            console.error("\u274C  Tenant with slug \"".concat(slug, "\" not found. Create it first in Admin UI."));
                            node_process_1.default.exit(1);
                        }
                        return [2 /*return*/, res.docs[0].id];
                }
            });
        });
    }
    function upsert(collection, where, data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, created;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, payload_1.default.find({ collection: collection, where: where, limit: 1 })];
                    case 1:
                        existing = _a.sent();
                        if (existing.totalDocs)
                            return [2 /*return*/, existing.docs[0].id];
                        return [4 /*yield*/, payload_1.default.create({ collection: collection, data: data })];
                    case 2:
                        created = _a.sent();
                        return [2 /*return*/, created.id];
                }
            });
        });
    }
    var xml, parser, data, items, attachmentMap, _i, items_1, item, TENANT_SLUG, tenantId, _a, items_2, item, authorLogin, authorId, catIds, tagIds, catNodes, _b, catNodes_1, c, entry, target, id, metas, thumb, featuredImageUrl;
    var _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0: return [4 /*yield*/, payload_1.default.init({
                    secret: node_process_1.default.env.PAYLOAD_SECRET,
                    mongoURL: node_process_1.default.env.MONGODB_URI,
                    local: true,
                })];
            case 1:
                _f.sent();
                console.log('Connected to MongoDB – starting import…');
                xml = node_fs_1.default.readFileSync(absPath, 'utf8');
                parser = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false });
                data = parser.parse(xml);
                items = (_e = (_d = (_c = data === null || data === void 0 ? void 0 : data.rss) === null || _c === void 0 ? void 0 : _c.channel) === null || _d === void 0 ? void 0 : _d.item) !== null && _e !== void 0 ? _e : [];
                attachmentMap = new Map();
                for (_i = 0, items_1 = items; _i < items_1.length; _i++) {
                    item = items_1[_i];
                    if (item['wp:post_type'] === 'attachment') {
                        attachmentMap.set(item['wp:post_id'], item['wp:attachment_url']);
                    }
                }
                TENANT_SLUG = 'Case';
                return [4 /*yield*/, getTenantIdBySlug(TENANT_SLUG)
                    /** ------------------------- Main loop ------------------------------- */
                ];
            case 2:
                tenantId = _f.sent();
                _a = 0, items_2 = items;
                _f.label = 3;
            case 3:
                if (!(_a < items_2.length)) return [3 /*break*/, 11];
                item = items_2[_a];
                if (item['wp:post_type'] !== 'post')
                    return [3 /*break*/, 10];
                authorLogin = item['dc:creator'] || 'unknown';
                return [4 /*yield*/, upsert('authors', { login: { equals: authorLogin } }, { login: authorLogin, name: authorLogin })
                    // Categories & tags
                ];
            case 4:
                authorId = _f.sent();
                catIds = [];
                tagIds = [];
                catNodes = Array.isArray(item.category) ? item.category : [item.category].filter(Boolean);
                _b = 0, catNodes_1 = catNodes;
                _f.label = 5;
            case 5:
                if (!(_b < catNodes_1.length)) return [3 /*break*/, 8];
                c = catNodes_1[_b];
                if (!c)
                    return [3 /*break*/, 7];
                entry = { slug: c['@_nicename'], title: c['#text'] };
                target = c['@_domain'] === 'category' ? 'categories' : 'tags';
                return [4 /*yield*/, upsert(target, { slug: { equals: entry.slug } }, entry)];
            case 6:
                id = _f.sent();
                target === 'categories' ? catIds.push(id) : tagIds.push(id);
                _f.label = 7;
            case 7:
                _b++;
                return [3 /*break*/, 5];
            case 8:
                metas = Array.isArray(item['wp:postmeta']) ? item['wp:postmeta'] : [];
                thumb = metas.find(function (m) { return m['wp:meta_key'] === '_thumbnail_id'; });
                featuredImageUrl = thumb ? rewriteUrl(attachmentMap.get(thumb['wp:meta_value'])) : undefined;
                // Create wordpress-posts doc
                return [4 /*yield*/, payload_1.default.create({
                        collection: 'wordpress-posts',
                        data: {
                            title: item.title,
                            slug: item['wp:post_name'] || (0, slugify_1.default)(item.title, { lower: true }),
                            status: item['wp:status'] === 'publish' ? 'published' : 'draft',
                            publishedAt: new Date(item['wp:post_date_gmt'] + 'Z'),
                            excerpt: (item['excerpt:encoded'] || '').trim(),
                            content: item['content:encoded'],
                            categories: catIds,
                            tags: tagIds,
                            author: authorId,
                            featuredImageUrl: featuredImageUrl,
                            tenant: tenantId, // injected field by plugin; we manually set it here
                        },
                    })];
            case 9:
                // Create wordpress-posts doc
                _f.sent();
                console.log("\u2714 Imported: ".concat(item.title));
                _f.label = 10;
            case 10:
                _a++;
                return [3 /*break*/, 3];
            case 11:
                console.log('\n✅  All done! Check your Admin UI.');
                node_process_1.default.exit(0);
                return [2 /*return*/];
        }
    });
}); })();
/**
 * Replace WordPress attachment URL with our CDN base.
 * Keeps the path after the first "/candelora/" (case-insensitive).
 */
function rewriteUrl(original) {
    if (!original)
        return undefined;
    var lower = original.toLowerCase();
    var marker = '/candelora/';
    var idx = lower.indexOf(marker);
    var pathPart = idx === -1 ? new URL(original).pathname : original.slice(idx + marker.length);
    return "https://cthousegop.com/Candelora/".concat(pathPart.replace(/^\/+/, ''));
}
