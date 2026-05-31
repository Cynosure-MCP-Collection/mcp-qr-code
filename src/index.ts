#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { QRCode as DecodedQrCode } from 'jsqr';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { z } from 'zod';

const DEFAULT_OUTPUT_DIR = path.join(tmpdir(), 'cynosure-mcp', 'qr-code');
const require = createRequire(import.meta.url);
const jsQR = require('jsqr') as (data: Uint8ClampedArray, width: number, height: number) => DecodedQrCode | null;

function getOutputDir(): string {
    return process.env.QR_CODE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
}

async function ensureOutputDir(): Promise<string> {
    const dir = getOutputDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

function log(msg: string): void {
    process.stderr.write(`[qr-code-mcp ${new Date().toISOString()}] ${msg}\n`);
}

function safeFilename(prefix: string, extension: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${ts}.${extension}`;
}

function stripDataUrl(value: string): string {
    const comma = value.indexOf(',');
    return value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value;
}

async function imageBufferFromInput(imagePath?: string, imageBase64?: string): Promise<Buffer> {
    if (imagePath) {
        return fs.readFile(imagePath);
    }
    if (imageBase64) {
        return Buffer.from(stripDataUrl(imageBase64), 'base64');
    }
    throw new Error('Provide either image_path or image_base64.');
}

const server = new McpServer({
    name: 'QR Code',
    version: '1.0.0',
    title: 'QR Code',
    description: 'Generate QR codes and read QR codes from image files.',
    icons: [{ src: 'https://raw.githubusercontent.com/andreasjhagen/Cynosure-MCPs/main/mcp-qr-code/icon.png', mimeType: 'image/png' }],
});

server.registerTool(
    'generate_qr_code',
    {
        description: 'Generate a QR code from text or a URL. Saves the output to disk and returns the generated image.',
        inputSchema: {
            text: z.string().min(1).describe('Text, URL, or other payload to encode in the QR code.'),
            format: z.enum(['png', 'svg']).default('png').describe('Output format. Both PNG and SVG return inline image data.'),
            size: z.number().int().min(128).max(4096).default(512).describe('PNG width/height in pixels. Ignored for SVG.'),
            margin: z.number().int().min(0).max(20).default(4).describe('Quiet zone around the QR code, measured in QR modules.'),
            error_correction_level: z.enum(['L', 'M', 'Q', 'H']).default('M').describe('QR error correction level. H is largest and most resilient.'),
            dark_color: z.string().default('#000000').describe('Dark module color as CSS hex/rgb/name.'),
            light_color: z.string().default('#ffffff').describe('Light background color as CSS hex/rgb/name.'),
        },
    },
    async ({ text, format, size, margin, error_correction_level, dark_color, light_color }) => {
        try {
            const outputDir = await ensureOutputDir();
            const filePath = path.join(outputDir, safeFilename('qr_code', format));
            const options = {
                errorCorrectionLevel: error_correction_level,
                margin,
                color: {
                    dark: dark_color,
                    light: light_color,
                },
            } as const;

            if (format === 'svg') {
                const svg = await QRCode.toString(text, { ...options, type: 'svg' });
                await fs.writeFile(filePath, svg, 'utf8');
                return {
                    content: [
                        { type: 'text', text: `QR code generated and saved to: ${filePath}` },
                        { type: 'image', data: Buffer.from(svg, 'utf8').toString('base64'), mimeType: 'image/svg+xml' },
                    ],
                };
            }

            const buffer = await QRCode.toBuffer(text, {
                ...options,
                type: 'png',
                width: size,
            });
            await fs.writeFile(filePath, buffer);
            return {
                content: [
                    { type: 'text', text: `QR code generated and saved to: ${filePath}` },
                    { type: 'image', data: buffer.toString('base64'), mimeType: 'image/png' },
                ],
            };
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Failed to generate QR code: ${err instanceof Error ? err.message : String(err)}` }],
                isError: true,
            };
        }
    },
);

server.registerTool(
    'read_qr_code',
    {
        description: 'Read and decode a QR code from an image file path or base64 image data. Supports common formats handled by sharp, including PNG, JPEG, WebP, GIF, and TIFF.',
        inputSchema: {
            image_path: z.string().optional().describe('Path to an image file containing a QR code.'),
            image_base64: z.string().optional().describe('Base64 encoded image data, with or without a data URL prefix.'),
        },
    },
    async ({ image_path, image_base64 }) => {
        try {
            const input = await imageBufferFromInput(image_path, image_base64);
            const { data, info } = await sharp(input)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);

            if (!result) {
                return {
                    content: [{ type: 'text', text: 'No QR code could be decoded from the provided image.' }],
                    isError: true,
                };
            }

            return {
                content: [
                    { type: 'text', text: result.data },
                    {
                        type: 'text',
                        text: JSON.stringify({
                            location: result.location,
                            chunks: result.chunks,
                        }, null, 2),
                    },
                ],
            };
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Failed to read QR code: ${err instanceof Error ? err.message : String(err)}` }],
                isError: true,
            };
        }
    },
);

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('QR Code MCP server running on stdio');
}

main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
