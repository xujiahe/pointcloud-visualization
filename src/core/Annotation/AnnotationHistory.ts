export interface Command {
  execute(): void
  undo(): void
}

export class AnnotationHistory {
  private readonly MAX_HISTORY = 50
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  /**
   * 执行命令并入栈
   */
  execute(command: Command): void {
    command.execute()
    this.undoStack.push(command)
    // 超出最大历史深度时，移除最旧的记录
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift()
    }
    // 执行新命令后清空 redo 栈
    this.redoStack = []
  }

  /**
   * 撤销最近一次操作
   */
  undo(): void {
    const command = this.undoStack.pop()
    if (command) {
      command.undo()
      this.redoStack.push(command)
    }
  }

  /**
   * 重做最近一次撤销的操作
   */
  redo(): void {
    const command = this.redoStack.pop()
    if (command) {
      command.execute()
      this.undoStack.push(command)
    }
  }

  /**
   * 清空所有历史记录
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get undoCount(): number { return this.undoStack.length }
  get redoCount(): number { return this.redoStack.length }
}
