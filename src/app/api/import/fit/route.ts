import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'coming_soon', status: 200 },
    { status: 200 }
  )
}
