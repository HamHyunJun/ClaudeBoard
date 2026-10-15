import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { CreateProjectBody, ProjectConfig } from '@claudeboard/shared'

/** 프로젝트 목록을 ~/.claudeboard/projects.json 에 저장한다 */
export class ProjectStore {
  private file: string
  private projects: ProjectConfig[] = []

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.file = join(dataDir, 'projects.json')
    if (existsSync(this.file)) {
      try {
        this.projects = JSON.parse(readFileSync(this.file, 'utf8'))
      } catch (err) {
        console.error(`[projects] ${this.file} 를 읽지 못해 빈 목록으로 시작합니다`, err)
      }
    }
  }

  list(): ProjectConfig[] {
    return this.projects
  }

  get(id: string): ProjectConfig | undefined {
    return this.projects.find((p) => p.id === id)
  }

  add(body: CreateProjectBody): ProjectConfig {
    const cwd = resolve(body.cwd.replace(/^~(?=$|\/)/, homedir()))
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      throw new Error(`디렉터리를 찾을 수 없습니다: ${cwd}`)
    }
    if (this.projects.some((p) => p.cwd === cwd)) {
      throw new Error(`이미 등록된 경로입니다: ${cwd}`)
    }
    const name = body.name?.trim() || basename(cwd)
    const project: ProjectConfig = {
      id: this.uniqueId(name),
      name,
      cwd,
      command: body.command?.trim() || undefined,
      args: body.args?.length ? body.args : undefined,
      autoStart: body.autoStart ?? false
    }
    this.projects.push(project)
    this.save()
    return project
  }

  remove(id: string): boolean {
    const before = this.projects.length
    this.projects = this.projects.filter((p) => p.id !== id)
    if (this.projects.length !== before) this.save()
    return this.projects.length !== before
  }

  /** 원자적 저장: 임시 파일에 쓰고 rename */
  private save() {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.projects, null, 2))
    renameSync(tmp, this.file)
  }

  private uniqueId(name: string): string {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-|-$/g, '') || 'project'
    let id = base
    let i = 2
    while (this.projects.some((p) => p.id === id)) id = `${base}-${i++}`
    return id
  }
}
