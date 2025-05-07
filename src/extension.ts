import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

function execGitCommand(command: string, cwd: string) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "squash-push" is now active!');
  const disposable = vscode.commands.registerCommand('squash-push.helloWorld', async () => {
    vscode.window.showInformationMessage('Hello World from squash&amp;push!');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found.');
      return;
    }
    console.log("current folder path is ", workspaceFolder);
    try {
      const currentBranch = await execGitCommand("git symbolic-ref --short HEAD", workspaceFolder);
    } catch {
      vscode.window.showErrorMessage("You are maybe in detached State, please checkout to a branch");
      return;
    }
    
	});

	context.subscriptions.push(disposable);
}
