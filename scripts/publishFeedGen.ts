import fs from 'node:fs';
import { AtpAgent, type BlobRef } from '@atproto/api';

if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
	throw new Error('Please provide a hostname in the .env file');
}

if (!process.env.APP_PASSWORD) {
	throw new Error('Please provide an app password in the .env file');
}

// Bluesky handle
const handle = 'webpro.nl';

// Bluesky password (preferably an App Password)
const password = process.env.APP_PASSWORD;

// Optionally, enter a custom PDS service to sign in with: (default: https://bsky.social)
const service = 'https://bsky.social';

// Enter a short name or the record (15 chars max). This will be shown in the feed's URL
const recordName = 'webpro-nl-js-ts';

// Optionally, enter a display name for your feed (must not be longer than 24 graphemes)
const displayName = 'JS/TS';

// Optionally, enter a brief description of your feed
const description =
	'Filter for keywords like javascript and typescript (list: https://github.com/webpro/bare-minimum-atproto-feed-cf-durable-object/blob/main/src/keywords.ts)';

// Optionally, enter a local path to an avatar that will be used for the feed
const avatar = './ts.png';

const run = async () => {
	const feedGenDid = process.env.FEEDGEN_SERVICE_DID ?? `did:web:${process.env.FEEDGEN_HOSTNAME}`;

	const agent = new AtpAgent({ service });

	await agent.login({ identifier: handle, password });

	let avatarRef: BlobRef | undefined;
	if (avatar) {
		let encoding: string;
		if (avatar.endsWith('png')) {
			encoding = 'image/png';
		} else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
			encoding = 'image/jpeg';
		} else {
			throw new Error('expected png or jpeg');
		}
		const img = fs.readFileSync(avatar);
		const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
			encoding,
		});
		avatarRef = blobRes.data.blob;
	}

	await agent.api.com.atproto.repo.putRecord({
		repo: agent.session?.did ?? '',
		collection: 'app.bsky.feed.generator',
		rkey: recordName,
		record: {
			did: feedGenDid,
			displayName: displayName,
			description: description,
			avatar: avatarRef,
			createdAt: new Date().toISOString(),
		},
	});

	console.log('All done 🎉');
};

run();
