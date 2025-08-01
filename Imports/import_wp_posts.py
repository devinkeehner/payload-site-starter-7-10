import requests
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

# --- CONFIG (can be overridden via CLI) ---
DEFAULT_PAYLOAD_URL = 'http://localhost:3000'
DEFAULT_ADMIN_EMAIL = 'admin@example.com'
DEFAULT_ADMIN_PASSWORD = 'password'
DEFAULT_XML_FILE = 'Imports/staterepresentativevincentcandelora.WordPress.2025-07-14.xml'
DEFAULT_TENANT_SLUG = 'hall'  # e.g. candelora

import argparse

parser = argparse.ArgumentParser(description='Import WordPress posts into Payload CMS')
parser.add_argument('--url', default=DEFAULT_PAYLOAD_URL, help='Base URL of the Payload instance')
parser.add_argument('--email', default=DEFAULT_ADMIN_EMAIL, help='Admin email for JWT auth')
parser.add_argument('--password', default=DEFAULT_ADMIN_PASSWORD, help='Admin password for JWT auth')
parser.add_argument('--xml', default=DEFAULT_XML_FILE, help='Path to the WordPress WXR export')
parser.add_argument('--tenant', default=DEFAULT_TENANT_SLUG, help='Tenant slug to assign posts to')
args = parser.parse_args()

PAYLOAD_URL = args.url.rstrip('/')
ADMIN_EMAIL = args.email
ADMIN_PASSWORD = args.password
XML_FILE = args.xml
TENANT_SLUG = args.tenant

# --- AUTH ---
def get_jwt():
    resp = requests.post(f'{PAYLOAD_URL}/api/users/login', json={
        'email': ADMIN_EMAIL,
        'password': ADMIN_PASSWORD
    })
    resp.raise_for_status()
    return resp.json()['token']

# --- TENANT ID ---
def get_tenant_id(jwt, slug):
    resp = requests.get(f'{PAYLOAD_URL}/api/tenants', headers={'Authorization': f'JWT {jwt}'}, params={'where[slug][equals]': slug})
    resp.raise_for_status()
    docs = resp.json().get('docs', [])
    if not docs:
        raise Exception(f'Tenant with slug {slug} not found!')
    return docs[0]['id']

# --- IMAGE URL REWRITE ---
def rewrite_url(original):
    if not original:
        return None
    marker = '/candelora/'
    lower = original.lower()
    idx = lower.find(marker)
    if idx == -1:
        path_part = urlparse(original).path
    else:
        path_part = original[idx + len(marker):]
    return f'https://cthousegop.com/Candelora/{path_part.lstrip('/')}'

# --- IMPORT POSTS ---
def import_posts(jwt, tenant_id):
    tree = ET.parse(XML_FILE)
    root = tree.getroot()
    ns = {
        'wp': 'http://wordpress.org/export/1.2/',
        'content': 'http://purl.org/rss/1.0/modules/content/',
        'excerpt': 'http://wordpress.org/export/1.2/excerpt/'
    }
    items = root.findall('.//item')

    # Build attachment map
    attachment_map = {}
    for item in items:
        post_type = item.find('wp:post_type', ns)
        if post_type is not None and post_type.text == 'attachment':
            post_id = item.find('wp:post_id', ns).text
            url = item.find('wp:attachment_url', ns).text
            attachment_map[post_id] = url

    imported = 0
    for item in items:
        post_type = item.find('wp:post_type', ns)
        if post_type is None or post_type.text != 'post':
            continue
        title = item.find('title').text or ''
        slug = item.find('wp:post_name', ns)
        slug = slug.text if slug is not None else ''
        status = item.find('wp:status', ns)
        status = 'published' if status is not None and status.text == 'publish' else 'draft'
        published_at = item.find('wp:post_date_gmt', ns)
        published_at = published_at.text + 'Z' if published_at is not None else None
        excerpt = item.find('excerpt:encoded', ns)
        excerpt = excerpt.text.strip() if excerpt is not None and excerpt.text else ''
        content = item.find('content:encoded', ns)
        content = content.text if content is not None else ''
        # Featured image
        featured_image_url = None
        for meta in item.findall('wp:postmeta', ns):
            key = meta.find('wp:meta_key', ns)
            if key is not None and key.text == '_thumbnail_id':
                val = meta.find('wp:meta_value', ns)
                if val is not None:
                    featured_image_url = rewrite_url(attachment_map.get(val.text))
        # Create post
        data = {
            'title': title,
            'slug': slug or title.lower().replace(' ', '-'),
            'status': status,
            'publishedAt': published_at,
            'excerpt': excerpt,
            'content': content,
            'featuredImageUrl': featured_image_url,
            'tenant': tenant_id
        }
        resp = requests.post(f'{PAYLOAD_URL}/api/wordpress-posts', json=data, headers={'Authorization': f'JWT {jwt}'})
        if resp.status_code == 201:
            print(f'Imported: {title}')
            imported += 1
        else:
            print(f'Failed: {title} ({resp.status_code}) {resp.text}')
    print(f'\nDone! Imported {imported} posts.')

if __name__ == '__main__':
    jwt = get_jwt()
    tenant_id = get_tenant_id(jwt, TENANT_SLUG)
    import_posts(jwt, tenant_id)
