import { AtpAgent } from '@atproto/api';

const handle = 'webpro.nl';
const password = process.env.APP_PASSWORD;
const service = 'https://bsky.social';
const recordName = 'webpro-nl-js-ts';

const run = async () => {
	// only update this if in a test environment
	const agent = new AtpAgent({ service });
	await agent.login({ identifier: handle, password });

	await agent.api.com.atproto.repo.deleteRecord({
		repo: agent.session?.did ?? '',
		collection: 'app.bsky.feed.generator',
		rkey: recordName,
	});

	console.log('All done 🎉');
};

run();
