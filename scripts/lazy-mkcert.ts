#!/usr/bin/env bun
/**
 * Generate the local TLS certificate used by the code-server harness.
 *
 * mkcert is trusted by the client browser, which is why the GUI uses it instead
 * of code-server's ephemeral self-signed certificate. Every run re-reads the
 * host's current interface addresses so a laptop that moved networks still gets
 * a certificate for the address it is reachable on.
 *
 *   bun run lazy_mkcert
 *   bun run lazy_mkcert --force
 *   CERT_IP_URL="10.0.0.2 devbox.local" bun run lazy_mkcert
 *
 * Existing out/certs/pub.pem + out/certs/key.pem are reused unless --force is
 * given. The script never deletes certificate files.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const CERT_DIR = process.env.CERT_DIR
  ? resolve(process.env.CERT_DIR)
  : join(REPO, "out", "certs");
const CERT_FILE = join(CERT_DIR, "pub.pem");
const KEY_FILE = join(CERT_DIR, "key.pem");

type IpAddressInfo = {
  family?: string;
  local?: string;
  scope?: string;
};

type IpInterface = {
  ifname?: string;
  addr_info?: IpAddressInfo[];
};

function usage(): void {
  console.log(`Usage: bun run lazy_mkcert [--force] [host ...]

Generates ${CERT_FILE} and ${KEY_FILE} for:
  - localhost, 127.0.0.1 and ::1
  - every address reported by \`ip -j addr\`
  - extra hosts from arguments or CERT_IP_URL

Options:
  -f, --force   regenerate even when both certificates already exist
  -h, --help    show this message

Environment:
  CERT_DIR      override the default out/certs directory
  CERT_IP_URL   extra hosts, separated by spaces (same as positional args)`);
}

function fail(message: string): never {
  console.error(`lazy_mkcert: ${message}`);
  process.exit(1);
}

function commandPath(name: string): string {
  const path = Bun.which(name);
  if (!path) fail(`${name} is not installed or not on PATH`);
  return path;
}

function splitHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\s+/)
    .map((host) => host.trim())
    .filter(Boolean);
}

function interfaceAddresses(ipBinary: string): string[] {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync([ipBinary, "-j", "addr"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (cause) {
    fail(`could not run ${ipBinary} -j addr: ${String(cause)}`);
  }

  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    fail(`\`ip -j addr\` failed${stderr ? `: ${stderr}` : ""}`);
  }

  let interfaces: IpInterface[];
  try {
    interfaces = JSON.parse(new TextDecoder().decode(result.stdout)) as IpInterface[];
  } catch (cause) {
    fail(`could not parse \`ip -j addr\` output: ${String(cause)}`);
  }

  const addresses: string[] = [];
  for (const iface of interfaces) {
    for (const info of iface.addr_info ?? []) {
      if (info.family !== "inet" && info.family !== "inet6") continue;
      // Scoped IPv6 addresses (fe80::1%eth0) are not valid certificate SANs.
      if (!info.local || info.local.includes("%")) continue;
      addresses.push(info.local);
    }
  }
  return addresses;
}

function uniqueHosts(hosts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const host of hosts) {
    if (!host || seen.has(host)) continue;
    seen.add(host);
    result.push(host);
  }
  return result;
}

function main(): void {
  const args = process.argv.slice(2);
  let force = false;
  const extraHosts: string[] = [];

  for (const arg of args) {
    if (arg === "-f" || arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      usage();
      return;
    }
    if (arg.startsWith("-")) fail(`unknown option: ${arg}`);
    extraHosts.push(...splitHosts(arg));
  }

  const mkcert = commandPath("mkcert");
  const ip = commandPath("ip");

  const hosts = uniqueHosts([
    "localhost",
    "127.0.0.1",
    "::1",
    ...interfaceAddresses(ip),
    ...extraHosts,
    ...splitHosts(process.env.CERT_IP_URL),
  ]);

  const hasCert = existsSync(CERT_FILE);
  const hasKey = existsSync(KEY_FILE);
  if (!force && hasCert && hasKey) {
    console.info(`lazy_mkcert: keeping existing ${CERT_FILE} and ${KEY_FILE}`);
    console.info("lazy_mkcert: use --force to regenerate");
    return;
  }
  if (!force && (hasCert || hasKey)) {
    console.info("lazy_mkcert: existing certificate set is incomplete; regenerating");
  }

  mkdirSync(CERT_DIR, { recursive: true });
  console.info(`lazy_mkcert: writing ${CERT_FILE} and ${KEY_FILE}`);
  console.info(`lazy_mkcert: SANs: ${hosts.join(" ")}`);

  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(
      [mkcert, "-cert-file", CERT_FILE, "-key-file", KEY_FILE, ...hosts],
      { stdout: "inherit", stderr: "inherit" },
    );
  } catch (cause) {
    fail(`could not run mkcert: ${String(cause)}`);
  }

  if (result.exitCode !== 0) {
    fail(`mkcert failed with exit code ${result.exitCode ?? "unknown"}`);
  }
}

main();
