# team3332.com — DNS Inventory (captured from GoDaddy, June 6 2026)

Snapshot taken before migrating DNS hosting to Cloudflare. If anything breaks, these are the records that must exist.

## Email — Microsoft 365 (ernest@team3332.com inbox) — CRITICAL
| Type | Name | Value | Priority |
|---|---|---|---|
| MX | @ | team3332-com.mail.protection.outlook.com | 0 |
| TXT | @ | NETORGFT20796388.onmicrosoft.com | |
| TXT | @ | v=spf1 include:secureserver.net -all | |
| CNAME | autodiscover | autodiscover.outlook.com | |
| CNAME | lyncdiscover | webdir.online.lync.com | |
| CNAME | msoid | clientconfig.microsoftonline-p.net | |
| CNAME | sip | sipdir.online.lync.com | |
| SRV | _sip._tls.@ | 100 1 443 sipdir.online.lync.com | |
| SRV | _sipfederationtls._tcp.@ | 100 1 5061 sipfed.online.lync.com | |
| TXT | _dmarc | v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net; | |

## Email — Resend (noreply@team3332.com sending) — CRITICAL
| Type | Name | Value | Priority |
|---|---|---|---|
| MX | send | feedback-smtp.us-east-1.amazonses.com | 10 |
| TXT | send | v=spf1 include:dc-fd741b8612._spfm.send.team3332.com ~all | |
| TXT | dc-fd741b8612._spfm.send | v=spf1 include:amazonses.com ~all | |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFzIQhahD94AwpbbPKX0QZxJEEcE/OZ4EHPHDuZDowNM6AQcSWfyTpSXeSRNRe+FvAAmz9+9bmOeiCZd2Zfk1gLkUhrf5c1Qr21ldncg5qfjoinXZh11JzBvNJwx4hF3NJ4wpioxmlq4Oie1QC6ATJemAz4+A2akmbNAL4Yl5hlwIDAQAB | |

## Website — Railway
| Type | Name | Value |
|---|---|---|
| CNAME | www | jinxbgrf.up.railway.app |
| CNAME | @ | k5efsvxc.up.railway.app  ← TO ADD in Cloudflare (GoDaddy can't do root CNAME — the whole reason for this migration) |
| TXT | _railway-verify | railway-verify=edf983ec... (full value in Railway → team3332.com → Show DNS records) ← TO ADD |

## GoDaddy-specific (OK to drop after migration)
| Type | Name | Value | Note |
|---|---|---|---|
| CNAME | email | email.secureserver.net | GoDaddy webmail redirect — unused |
| CNAME | pay | paylinks.commerce.godaddy.com | GoDaddy paylinks — unused |
| CNAME | _domainconnect | _domainconnect.gd.domaincontrol.com | GoDaddy internal |
| NS/SOA | @ | ns55/ns56.domaincontrol.com | Replaced by Cloudflare nameservers |

## Cloudflare settings notes
- Railway CNAMEs (@ and www): set Proxy status to **DNS only** (grey cloud) so Railway issues its own SSL certificate.
- All other records: import as-is.
