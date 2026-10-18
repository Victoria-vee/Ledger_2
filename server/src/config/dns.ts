import { execFile } from "node:child_process";
import { isIP } from "node:net";
import dns from "node:dns";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isLoopbackResolver(server: string): boolean {
  const address = server.toLowerCase();
  return (
    address === "localhost" ||
    address === "::1" ||
    address.startsWith("127.")
  );
}

async function getWindowsDnsServers(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; Get-DnsClientServerAddress | ForEach-Object { $_.ServerAddresses } | ConvertTo-Json -Compress",
    ],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );

  const parsed: unknown = JSON.parse(stdout);
  const candidates = typeof parsed === "string" ? [parsed] : parsed;

  if (!Array.isArray(candidates)) {
    throw new Error("Windows DNS configuration has an unexpected format.");
  }

  const servers = candidates.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && isIP(candidate) !== 0,
  );

  if (servers.length === 0) {
    throw new Error("No Windows DNS servers are configured.");
  }

  return [...new Set(servers)];
}

export async function configureDnsResolver(): Promise<void> {
  const currentServers = dns.getServers();
  if (
    process.platform !== "win32" ||
    currentServers.length === 0 ||
    !currentServers.every(isLoopbackResolver)
  ) {
    return;
  }

  let windowsServers: string[];
  try {
    windowsServers = await getWindowsDnsServers();
  } catch {
    throw new Error(
      "Node.js is using a loopback DNS resolver and Windows DNS settings could not be loaded.",
    );
  }

  dns.setServers(windowsServers);
  console.info("Using Windows network DNS servers for Node.js DNS queries.");
}
