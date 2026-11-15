"""Run PipelineLab locally using only Python's standard library."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8734)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent / 'dist'
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        parser.exit(1, f'Could not start server: {error}\nTry another port: python start.py --port 8735\n')
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'PipelineLab is running at {url}\nPress Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nPipelineLab stopped.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
