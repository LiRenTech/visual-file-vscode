import * as vscode from 'vscode';

type SimpleHandle = { kind: 'file'; name: string; size: number } | { kind: 'directory'; name: string; children: SimpleHandle[] };

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('visual-file.visualize', () => {
    const panel = vscode.window.createWebviewPanel(
      'visual-file', // Identifies the type of the webview. Used internally
      'Visual File', // Title of the panel displayed to the user
      vscode.ViewColumn.One, // Editor column to show the new webview panel in.
      {
        enableScripts: true, // Allow JavaScript in the webview.
      } // Webview options. More on these later.
    );
    const appUrl = 'http://localhost:5173';
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Visual File</title>
    <style>
      body {
        margin: 0;
				padding: 0;
				height: 100vh;
				overflow: hidden;
				scrollbar-width: none;
      }
      iframe {
        width: 100%;
        height: 100%;
      }
    </style>
		<script>
			const vscode = acquireVsCodeApi();
			window.addEventListener('message', (event) => {
				if (event.data.isFromApp) {
					vscode.postMessage(event.data);
					console.log("app -> vscode", event.data);
				} else {
					const iframe = document.querySelector('iframe');
					iframe.contentWindow.postMessage(event.data, '*');
					console.log("vscode -> app", event.data);
				}
			});
		</script>
  </head>
  <body>
    <iframe src="${appUrl}" frameborder="0"></iframe>
  </body>
</html>
`;
    panel.webview.onDidReceiveMessage(async (message) => {
      const { command, data } = message;
      if (command === 'load-dir') {
        // 获取当前工作区文件夹，转换为单个SimpleHandle { kind: 'directory', name: '项目文件夹名', children: SimpleHandle[] }
        // 要用嵌套结构，可以写一个递归函数
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          return;
        }
        if (workspaceFolders.length > 1) {
          vscode.window.showWarningMessage('当前只支持单个工作区文件夹');
          return;
        }
        const workspaceFolder = workspaceFolders[0];
        const loadDir = async (uri: vscode.Uri) => {
          const result: SimpleHandle = {
            kind: 'directory',
            name: uri.path.split('/').pop() || uri.path,
            children: [],
          };
          const files = await vscode.workspace.fs.readDirectory(uri);
          for (const [name, type] of files) {
            if (type === vscode.FileType.Directory) {
              const sub = await loadDir(vscode.Uri.joinPath(uri, name));
              if (sub) {
                result.children.push(sub);
              }
            } else {
              result.children.push({
                kind: 'file',
                name,
                size: (await vscode.workspace.fs.stat(vscode.Uri.joinPath(uri, name))).size,
              });
            }
          }
          return result;
        };
        panel.webview.postMessage({
          command: 'load-dir-result',
          data: await loadDir(workspaceFolder.uri),
        });
      }
      if (command === 'navigate') {
        const uri = vscode.Uri.joinPath(getParent(vscode.workspace.workspaceFolders?.[0].uri!)!, data);
        vscode.commands.executeCommand('revealInExplorer', uri);
      }
      if (command === 'open') {
        const uri = vscode.Uri.joinPath(getParent(vscode.workspace.workspaceFolders?.[0].uri!)!, data);
        vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Beside });
      }
      if (command === 'copy-full-path') {
        const uri = vscode.Uri.joinPath(getParent(vscode.workspace.workspaceFolders?.[0].uri!)!, data);
        vscode.env.clipboard.writeText(uri.path);
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function getParent(uri: vscode.Uri) {
  const parent = uri.with({ path: uri.path.replace(/\/[^/]+$/, '') });
  if (parent.path === uri.path) {
    return null;
  }
  return parent;
}
