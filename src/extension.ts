import * as vscode from 'vscode';
import { exec } from "child_process";

const GIT_COMMANDS = {
  CURRENT_BRANCH: "git symbolic-ref --short HEAD",
  UPSTREAM_BRANCH: (branch: string) => `git rev-parse --symbolic-full-name --abbrev-ref ${branch}@{upstream}`,
  LOCAL_COMMITS: "git log --oneline",
  LOCAL_COMMITS_TRACKING: (upstreamBranch: string, branch: string) => `git log --oneline ${upstreamBranch}..${branch}`,
  SQUASH_AND_COMMIT: (commitID: string) => `git reset --soft ${commitID}~1 && git commit --amend`,
};

/**
 * Executes a Git command in the specified directory.
 *
 * @param {string} command - The Git command to execute
 * @param {string} cwd - The current working directory where the command should be executed
 * @returns {Promise<string>} A Promise that resolves with the command output or rejects with an error message
 */
function execGitCommand(command: string, cwd: string): Promise<string> {
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

/**
 * Retrieves the name of the current Git branch.
 *
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with the current branch name or null if in detached HEAD state
 */
const getCurrentBranch = async (workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(GIT_COMMANDS.CURRENT_BRANCH, workspaceFolder);
  } catch {
    return null;
  }
};

/**
 * Determines the upstream branch for the current branch.
 *
 * @param {string} currentBranch - The name of the current branch
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with the upstream branch name or null if no upstream is configured
 */
const getCurrentUpStreamBranch = async (currentBranch: string, workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(GIT_COMMANDS.UPSTREAM_BRANCH(currentBranch), workspaceFolder);
  } catch {
    return null;
  }
};

/**
 * Retrieves a list of local commits based on the provided Git command.
 *
 * @param {string} localCommitLogsCmd - The Git command to retrieve commit logs
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with a string containing the commit logs or null if an error occurs
 */
const getLocalCommits = async (localCommitLogsCmd: string, workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(localCommitLogsCmd, workspaceFolder);
  } catch {
    return null;
  }
};

const getCommitID = (selectedCommits: string[] | undefined) => {
  if (!selectedCommits) {
    vscode.window.showInformationMessage("No commits are selected.");
    return;
  }
  if (selectedCommits.length > 1) {
    vscode.window.showInformationMessage(
      "You have selected more than one commits, Please select the oldest commit to keep as base"
    );
    return;
  }
  return selectedCommits[0].split(" ")[0];
};

/**
 * Activates the extension and registers the squash-push command.
 * This is the main entry point for the extension.
 *
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "squash-push" is now active!');

  /**
   * Command handler for the squash-push.helloWorld command.
   * Identifies the current branch, upstream branch, and allows selection of a base commit for squashing.
   */
  const disposable = vscode.commands.registerCommand("squash-push.helloWorld", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    //Ensure the user is not in a detached HEAD, and get the current branch
    const currentBranch: string | null | undefined = await getCurrentBranch(workspaceFolder);
    if (!currentBranch) {
      vscode.window.showErrorMessage("You are maybe in detached State, please checkout to a branch");
      return;
    }

    //Get the current tracking upstream branch
    const currentUpstreamBranch = await getCurrentUpStreamBranch(currentBranch, workspaceFolder);

    //Get only the unpushed(local commits)
    let localCommitLogsCmd: string = GIT_COMMANDS.LOCAL_COMMITS;
    if (currentUpstreamBranch) {
      localCommitLogsCmd = GIT_COMMANDS.LOCAL_COMMITS_TRACKING(currentUpstreamBranch, currentBranch);
    }
    const localCommits: string | null | undefined = await getLocalCommits(localCommitLogsCmd, workspaceFolder);
    if (!localCommits) {
      vscode.window.showInformationMessage("No local commits found.");
      return;
    }

    //Show the list of commits to the user and allow selection of a base commit(selected_commit~1)
    try {
      const selectedCommits: string[] | undefined = await vscode.window.showQuickPick(localCommits.split("\n"), {
        canPickMany: true,
        placeHolder: "Select the oldest commit to keep as base",
      });
      const commitID = getCommitID(selectedCommits);
      if (!commitID) {
        return;
      }

      //Run a squash based on the last selected commit, and open the commit message to be filled by the user after
      try {
        execGitCommand(GIT_COMMANDS.SQUASH_AND_COMMIT(commitID), workspaceFolder);
      } catch (err) {
        vscode.window.showErrorMessage("An Error Occurred while squashing commits");
        console.error("An Error Occurred while squashing", err);
        return;
      }
    } catch (err) {
      console.error("An Error Occurred while showing selection window", err);
    }

    context.subscriptions.push(disposable);
  });
}