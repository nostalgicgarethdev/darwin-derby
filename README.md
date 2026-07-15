# Darwin Derby — Robinhood Chain (source export)

Files:
- index.html         -> full frontend (HTML + CSS + JS, single file)
- server-scripts.js  -> the 7 server-side scripts (getState, startHeat, joinHeat, settleHeat, preparePayout, recordPayout, setPrize)
- manifest.json      -> app manifest (permissions + script list)

## Important: platform dependency

This app was built to run inside the Bankr terminal app sandbox. Two things are platform-provided and will NOT exist on a plain PC / static host:

1. `bankr.*` SDK in index.html
   - bankr.invokeScript(name, args)  -> calls a server script
   - bankr.confirmTransaction(blob)  -> routes a payout tx to chat for owner confirmation
   - bankr.ctx.walletAddress, bankr.copy, bankr.on('ready')

2. Server-script globals in server-scripts.js
   - appKV.get/set        -> persistent key-value store (heat state, history, config)
   - bankr.wallet.me()    -> owner wallet address
   - bankr.chain.getBalance({chain:'robinhood',...}) -> treasury balance
   - bankr.tx.prepare(...) -> builds the ETH payout transaction on Robinhood Chain

## Running it standalone (outside Bankr)

To self-host (e.g. on Vercel like the original), you'd replace those pieces:

- appKV            -> any store (Redis, Postgres, Vercel KV, a JSON file)
- invokeScript     -> HTTP endpoints (e.g. /api/getState, /api/joinHeat) exposing the same
                      request/response shapes used in index.html
- bankr.chain.getBalance -> eth_getBalance via any Robinhood Chain RPC
- bankr.tx.prepare + confirmTransaction -> your own wallet flow
                      (e.g. ethers.js signer sending {to, value} on Robinhood Chain)
- bankr.ctx.walletAddress -> your own auth to identify the pit boss

The game logic itself (45s lobby, 20 slots, device/wallet/username dedupe,
bot fill, unbiased crypto.getRandomValues draw with modulo-bias rejection)
is plain JS and ports as-is.

## Easiest path

If you just want it running with zero backend work, keep using the hosted
version in your Bankr Apps panel — this export is for reference, backup, or
porting to your own stack.