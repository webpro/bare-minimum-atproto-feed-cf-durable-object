# atproto feed generator with cloudflare worker + durable object (sqlite)

The bare minimum implementation is in [src/index.ts](./src/index.ts).

Three locations having variables:

- `cp .env.example .env`
- `wranger.toml`
- `scripts/publishFeedGen.ts`

## Development

```sh
pnpm run dev
```

Should have these paths exposed:

- [localhost:8787](http://localhost:8787)
- [localhost:8787/.well-known/did.json](http://localhost:8787/.well-known/did.json)
- [localhost:8787/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://[DID]/app.bsky.feed.generator/[RECORD_NAME]](http://localhost:8787/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://DID/app.bsky.feed.generator/RECORD_NAME)

## Publish worker + durable object

```sh
pnpm run publish
```

## Publish feed generator

```sh
node --env-file .env --experimental-strip-types scripts/publishFeedGen.ts
```

## Unpublish

```sh
node --env-file .env --experimental-strip-types scripts/unpublishFeedGen.ts
```
