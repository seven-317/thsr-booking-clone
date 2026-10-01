import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {ImageResponse} from 'next/og';

export const alt = 'Taiwan High Speed Rail logo';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';
export const runtime = 'nodejs';

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), 'public', 'brand', 'thsr-logo.svg'));
  const logoDataUrl = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#ffffff'
      }}
    >
      <img src={logoDataUrl} width={622} height={250} alt="Taiwan High Speed Rail" />
    </div>,
    size
  );
}
