import { DurableObject } from 'cloudflare:workers';
import { decodeMultiple } from 'cbor-x';
import { cborToLexRecord, readCar } from '@atproto/repo';
import { isRecord, type Record } from './lexicon/types/app/bsky/feed/post';
import { BLOCKLIST, KEYWORDS, LANG } from './keywords';

const FIREHOSE_URL = 'wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos';
const WELL_KNOWN_PATHNAME = '/.well-known/did.json';
const SKELETON_PATHNAME = '/xrpc/app.bsky.feed.getFeedSkeleton';
const FEED_LIMIT = 300;
const PAGE_LIMIT = 30;
const headers = { 'Content-Type': 'application/json' };

const keywordMatch = new RegExp(`\\b(${KEYWORDS.join('|')})s?\\b`);
const blockMatch = new RegExp(`\\b(${BLOCKLIST.join('|')})\\b`);

const hasLang = (record: Record) => !record.langs || record.langs.length === 0 || record.langs.includes(LANG);
const hasKeyword = (record: Record) => keywordMatch.test(record.text.toLowerCase());
const hasBlock = (record: Record) => blockMatch.test(record.text.toLowerCase());
const isMatch = (record: Record) => hasLang(record) && hasKeyword(record) && !hasBlock(record);

export class ATPROTO_FEED extends DurableObject {
	private websocket: WebSocket | null = null;
	private sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.initDb();
		this.connect();
	}

	private async initDb() {
		this.sql.exec(`CREATE TABLE IF NOT EXISTS posts (
			uri TEXT PRIMARY KEY,
			cid TEXT NOT NULL,
			indexedAt TEXT NOT NULL
		)`);
	}

	private async connect() {
		this.websocket = new WebSocket(FIREHOSE_URL);

		this.websocket.addEventListener('message', async (event) => {
			const buffer = event.data as ArrayBuffer;
			const decoded = decodeMultiple(new Uint8Array(buffer));
			const body = decoded[1];
			if (body?.blocks) {
				const car = await readCar(body.blocks);
				for (const op of body.ops) {
					if (op.action === 'create') {
						if (!op.cid) continue;
						const recordBytes = car.blocks.get(op.cid);
						if (!recordBytes) continue;
						const record = cborToLexRecord(recordBytes);
						if (isRecord(record) && isMatch(record)) {
							const uri = `at://${body.repo}/${op.path}`;
							const cid = op.cid.toString();
							const indexedAt = new Date().toISOString();
							const query = `INSERT OR REPLACE INTO posts (uri, cid, indexedAt) VALUES ("${uri}", "${cid}", "${indexedAt}")`;
							this.sql.exec(query);
							const count = await this.sql.exec('SELECT COUNT(*) as count FROM posts').rowsRead;
							if (count > FEED_LIMIT) {
								const toDelete = count - FEED_LIMIT;
								this.sql.exec(
									`DELETE FROM posts WHERE uri IN (SELECT uri FROM posts ORDER BY indexedAt ASC LIMIT ${toDelete})`,
								);
							}
						}
					}
				}
			}
		});

		this.websocket.addEventListener('close', (event) => {
			console.log('ws closed', event);
			setTimeout(() => this.connect(), 5000);
		});

		this.websocket.addEventListener('error', (event) => {
			console.log('ws error', event);
		});
	}

	async getPosts({ limit = PAGE_LIMIT }: { limit?: number }) {
		const posts = this.sql.exec(`SELECT * FROM posts ORDER BY indexedAt DESC LIMIT ${limit}`).toArray();
		return posts.map((post) => ({ post: post.uri }));
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method === 'GET') {
			const posts = await this.getPosts({ limit: PAGE_LIMIT });
			return new Response(JSON.stringify(posts), { headers });
		}
		return new Response('Firehose connection active');
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const { hostname, pathname } = url;

		if (pathname === WELL_KNOWN_PATHNAME) {
			const body = {
				'@context': ['https://www.w3.org/ns/did/v1'],
				id: `did:web:${hostname}`,
				service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${hostname}` }],
			};
			return new Response(JSON.stringify(body), { headers });
		}

		const id = env.ATPROTO_FEED.idFromName('firehose');
		const feed = env.ATPROTO_FEED.get(id);

		if (pathname === SKELETON_PATHNAME) {
			const feedName = url.searchParams.get('feed');
			const limit = Number(url.searchParams.get('limit') ?? PAGE_LIMIT);
			if (feedName === `at://${env.FEEDGEN_PUBLISHER_DID}/app.bsky.feed.generator/${env.FEEDGEN_RECORD_NAME}`) {
				const posts = await feed.getPosts({ limit });
				return new Response(JSON.stringify({ feed: posts }), { headers });
			}
		}

		const posts = await feed.getPosts({ limit: PAGE_LIMIT });
		return new Response(JSON.stringify(posts), { headers });
	},
} satisfies ExportedHandler<Env>;
