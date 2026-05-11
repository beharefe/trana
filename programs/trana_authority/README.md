# trana_authority

PDA-based authority management with passkey second factor for Solana.

`trana_authority` lets programs own a PDA authority that requires passkey approval before executing privileged actions - program upgrades, parameter changes, treasury operations. Pairs with `trana_guard` for the proof verification layer.

## CPI Integration

```toml
[dependencies]
trana_authority = { version = "0.1.0", features = ["cpi"] }
```

## Links

- [Documentation](https://trana.so/docs)
- [GitHub](https://github.com/beharefe/trana)
- [Website](https://trana.so)
